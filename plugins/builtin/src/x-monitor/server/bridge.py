import asyncio
import json
import os
import sys
from contextlib import aclosing
from datetime import datetime, timezone

try:
    from loguru import logger
    from twscrape import API, Account, NoAccountError, Tweet, User, parse_tweets
    from twscrape.account import has_required_cookies
    from twscrape.login import login
    from twscrape.utils import find_obj
except ImportError:
    print('{"ok":false,"error":{"code":"runtime_missing"}}')
    sys.exit(0)


def millis(value: datetime) -> int:
    return int(value.timestamp() * 1000)


def failure(code: str, **details: object) -> dict:
    return {"ok": False, "error": {"code": code, **details}}


def account_view(account: Account) -> dict:
    now = datetime.now(timezone.utc)
    if not account.active or not account.has_session:
        state = "needs_auth"
    elif (locked := account.locks.get("UserTweets")) and locked > now:
        state = "rate_limited"
    else:
        state = "ready" if account.last_used else "configured"
    return {
        "username": account.username,
        "state": state,
        "lastUsedAt": millis(account.last_used) if account.last_used else None,
    }


async def save_account(api: API, request: dict) -> dict:
    username = request["username"]
    if request["mode"] == "cookie":
        cookie = request["cookie"]
    else:
        # 只在内存构造密码登录账号，账号池只保存登录完成后的会话。
        account = Account(
            username=username,
            password=request["password"],
            email=request["email"],
            email_password=request.get("emailPassword", ""),
            mfa_code=request.get("totpSecret"),
            user_agent="@chrome",
            active=False,
        )
        try:
            await login(account)
        except Exception:
            step = account.error_msg or ""
            if "LoginTwoFactorAuthChallenge" in step and not account.mfa_code:
                return failure("totp_required")
            if "LoginAcid" in step and not account.email_password:
                return failure("email_verification_required")
            return failure("login_failed")
        if not has_required_cookies(account.cookies):
            return failure("login_failed")
        cookie = json.dumps(account.cookies)
    try:
        await api.pool.add_account_cookies(username, cookie)
    except ValueError:
        return failure("invalid_cookie")
    return {"ok": True, "result": account_view(await api.pool.get(username))}


def author_view(user: User) -> dict:
    return {
        "id": user.id_str,
        "handle": user.username,
        "name": user.displayname,
        "avatarUrl": user.profileImageUrl or None,
    }


def post_view(tweet: Tweet) -> dict:
    media = [
        {"kind": "image", "url": photo.url, "previewUrl": photo.url, "alt": photo.altText}
        for photo in tweet.media.photos
    ]
    for video in tweet.media.videos:
        variant = max(
            (item for item in video.variants if item.contentType == "video/mp4"),
            default=None,
            key=lambda item: item.bitrate,
        )
        media.append({
            "kind": "video",
            "url": variant.url if variant else None,
            "previewUrl": video.thumbnailUrl,
            "alt": video.altText,
        })
    media.extend(
        {"kind": "gif", "url": item.videoUrl, "previewUrl": item.thumbnailUrl, "alt": item.altText}
        for item in tweet.media.animated
    )
    return {
        "id": tweet.id_str,
        "author": author_view(tweet.user),
        "publishedAt": millis(tweet.date),
        "url": tweet.url,
        "text": tweet.rawContent,
        "metrics": {
            "replies": tweet.replyCount,
            "reposts": tweet.retweetCount,
            "quotes": tweet.quoteCount,
            "likes": tweet.likeCount,
            "bookmarks": tweet.bookmarkedCount,
            "views": tweet.viewCount,
        },
        "media": media,
    }


def tweet_view(tweet: Tweet, target_id: str) -> dict:
    reference = tweet.retweetedTweet or tweet.quotedTweet
    reference_id = tweet.retweetedTweetIdStr or tweet.quotedTweetIdStr
    kind = "original"
    if tweet.retweetedTweetIdStr:
        kind = "repost"
    elif tweet.quotedTweetIdStr or tweet.isQuoteStatus:
        kind = "quote"
    return {
        **post_view(tweet),
        "targetId": target_id,
        "kind": kind,
        "referenceId": reference_id,
        "reference": post_view(reference) if reference else None,
    }


async def timeline_page(api: API, request: dict) -> dict:
    user_id = request["userId"]
    cursor = request["cursor"]
    variables = {"includePromotedContent": False}
    if cursor:
        variables["cursor"] = cursor
    # limit=1 让上游在产出一页后释放账号锁，调度器可轮转其他目标。
    async with aclosing(api.user_tweets_raw(int(user_id), limit=1, kv=variables)) as pages:
        page = await anext(pages, None)
    if page is None:
        return {"items": [], "pinned": None, "nextCursor": None}

    data = page.json()
    bottom = find_obj(data, lambda entry: entry.get("cursorType") == "Bottom")
    pin = find_obj(
        data, lambda entry: entry.get("type") == "TimelinePinEntry"
        or entry.get("__typename") == "TimelinePinEntry"
    )
    pinned_id = pin["entry"]["entryId"].removeprefix("tweet-") if pin else None
    items = []
    pinned = None
    for tweet in parse_tweets(page):
        if tweet.user.id_str != user_id or tweet.inReplyToTweetId is not None:
            continue
        item = tweet_view(tweet, user_id)
        if item["id"] == pinned_id:
            pinned = item
        else:
            items.append(item)
    next_cursor = bottom["value"] if bottom else None
    return {
        "items": items,
        "pinned": pinned,
        "nextCursor": next_cursor if next_cursor != cursor else None,
    }


async def no_account(api: API, method: str) -> dict:
    queue = "UserByScreenName" if method == "resolveTarget" else "UserTweets"
    now = datetime.now(timezone.utc)
    unlocks = [
        millis(until)
        for account in await api.pool.get_all()
        if account.active and account.has_session
        if (until := account.locks.get(queue)) and until > now
    ]
    if unlocks:
        return failure("rate_limited", retryAt=min(unlocks))
    return failure("needs_auth")


async def dispatch(api: API, method: str, request: dict | None) -> dict:
    if method == "runtime":
        return {"ok": True, "result": None}
    if method == "saveAccount":
        return await save_account(api, request)
    if method == "listAccounts":
        result = [account_view(item) for item in await api.pool.get_all()]
        return {"ok": True, "result": result}
    if method == "removeAccount":
        await api.pool.delete_accounts(request["username"])
        return {"ok": True, "result": None}
    if method == "resolveTarget":
        user = await api.user_by_login(request["handle"])
        return {"ok": True, "result": author_view(user) if user else None}
    return {"ok": True, "result": await timeline_page(api, request)}


async def main() -> dict:
    command = json.load(sys.stdin)
    method = command["method"]
    api = API(sys.argv[1], raise_when_no_account=True, wait_timeout=0)
    try:
        timeout = 110 if method == "saveAccount" else 40
        return await asyncio.wait_for(dispatch(api, method, command["input"]), timeout)
    except NoAccountError:
        return await no_account(api, method)
    except asyncio.TimeoutError:
        return failure("timeout")
    except Exception:
        # 只返回预定义错误，避免将上游请求内容和登录凭据写入日志。
        return failure("upstream")


if __name__ == "__main__":
    os.umask(0o077)
    logger.remove()
    print(json.dumps(asyncio.run(main())))
