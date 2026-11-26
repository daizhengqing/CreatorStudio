import hashlib
import hmac
import json
from contextlib import aclosing
from datetime import datetime
from itertools import chain
from urllib.parse import parse_qs, urlsplit

from twscrape import (
    API,
    Account,
    AccountAbout,
    AccountsPool,
    Community,
    MediaVideo,
    NoAccountError,
    Trend,
    Tweet,
    User,
    parse_trends,
    parse_tweets,
    parse_users,
)
from twscrape.db import fetchone
from twscrape.utils import find_obj, get_by_path


class InvalidCursor(Exception):
    pass


class BookmarkPool(AccountsPool):
    # 书签属于特定登录会话。使用同一账号库的锁，限流时也只考虑指定账号。
    def __init__(self, path: str, account: Account):
        super().__init__(path, raise_when_no_account=True, wait_timeout=0)
        self.account = account

    async def get_for_queue(self, queue: str) -> Account | None:
        row = await fetchone(
            self._db_file,
            """
            UPDATE accounts SET
                locks = json_set(locks, :lock, datetime('now', '+15 minutes')),
                last_used = datetime('now')
            WHERE username = :username AND active = 1
                AND json_extract(cookies, '$.auth_token') = :token
                AND length(json_extract(cookies, '$.ct0')) > 0
                AND (json_extract(locks, :lock) IS NULL OR json_extract(locks, :lock) <= datetime('now'))
            RETURNING *
            """,
            {
                "username": self.account.username,
                "token": self.account.cookies["auth_token"],
                "lock": f"$.{queue}",
            },
        )
        return Account.from_rs(row) if row else None


def millis(value: datetime) -> int:
    return int(value.timestamp() * 1000)


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


def research_post(tweet: Tweet) -> dict:
    post = post_view(tweet)
    media = chain(tweet.media.photos, tweet.media.videos, tweet.media.animated)
    for item, source in zip(post["media"], media):
        item.update({"id": source.id_str, "width": source.width, "height": source.height})
        if isinstance(source, MediaVideo):
            item.update({
                "durationMs": source.duration,
                "views": source.views,
                "variants": [variant.dict() for variant in source.variants],
            })
    reference = tweet.retweetedTweet or tweet.quotedTweet
    post.update({
        "language": tweet.lang,
        "conversationId": tweet.conversationIdStr,
        "parentPostId": tweet.inReplyToTweetIdStr,
        "quotedPostId": tweet.quotedTweetIdStr,
        "repostedPostId": tweet.retweetedTweetIdStr,
        "reference": post_view(reference) if reference else None,
        "hashtags": tweet.hashtags,
        "cashtags": tweet.cashtags,
        "links": [link.url for link in tweet.links],
        "mentions": [user.username for user in tweet.mentionedUsers],
    })
    if article := tweet.article:
        post["article"] = {
            "id": article.id_str,
            "title": article.title,
            "preview": article.previewText,
            "text": "\n".join(block.text for block in article.contentState.blocks) if article.contentState else None,
        }
    return post


def user_view(user: User) -> dict:
    return {
        **author_view(user),
        "url": user.url,
        "bio": user.rawDescription,
        "location": user.location,
        "joinedAt": millis(user.created),
        "followers": user.followersCount,
        "following": user.friendsCount,
        "posts": user.statusesCount,
        "mediaCount": user.mediaCount,
        "likes": user.favouritesCount,
        "listed": user.listedCount,
        "protected": user.protected,
        "verified": user.verified,
        "premiumVerified": user.blue,
        "bannerUrl": user.profileBannerUrl,
        "links": [link.url for link in user.descriptionLinks],
        "pinnedPostIds": [str(id) for id in user.pinnedIds],
    }


def about_view(about: AccountAbout) -> dict:
    return {
        "id": str(about.rest_id) if about.rest_id is not None else None,
        "handle": about.screen_name,
        "name": about.name,
        "country": about.account_based_in,
        "locationAccurate": about.location_accurate,
        "affiliatedHandle": about.affiliate_username,
        "source": about.source,
        "usernameChanges": about.username_changes,
        "usernameLastChangedAt": about.username_last_changed_at,
        "identityVerified": about.is_identity_verified,
        "verifiedSince": about.verified_since_msec,
    }


def community_view(community: Community) -> dict:
    return {
        "id": community.id_str,
        "name": community.name,
        "description": community.description,
        "memberCount": community.memberCount,
        "moderatorCount": community.moderatorCount,
        "topicId": community.topicId,
        "topicName": community.topicName,
        "rules": [rule.dict() for rule in community.rules],
    }


def trend_view(trend: Trend) -> dict:
    params = parse_qs(urlsplit(trend.trend_url.url).query)
    return {
        "id": trend.id,
        "name": trend.name,
        "rank": trend.rank,
        "query": params.get("query", [trend.name])[0],
        "url": trend.trend_url.url,
        "category": trend.trend_metadata.domain_context,
        "description": trend.trend_metadata.meta_description,
        "related": [{"name": item.name, "url": item.url.url} for item in trend.grouped_trends],
    }


def cursor_signature(request: dict, value: str, key: str) -> str:
    scope = {name: field for name, field in request.items() if name not in ("cursor", "count")}
    payload = json.dumps([scope, value], sort_keys=True, separators=(",", ":")).encode()
    if key:
        return hmac.digest(key.encode(), payload, "sha256").hex()
    return hashlib.sha256(payload).hexdigest()


def read_cursor(request: dict, key: str) -> str | None:
    if "cursor" not in request:
        return None
    signature, _, value = request["cursor"].partition(".")
    if not value or not hmac.compare_digest(signature.encode(), cursor_signature(request, value, key).encode()):
        raise InvalidCursor()
    return value


async def bookmark_api(api: API, username: str) -> tuple[API, str]:
    account = await api.pool.get_account(username)
    if not account or not account.active or not account.has_session:
        raise NoAccountError("No account available for queue Bookmarks")
    return API(BookmarkPool(api.pool._db_file, account)), account.cookies["auth_token"]


async def research(api: API, request: dict) -> dict:
    operation = request["operation"]
    if operation == "post":
        tweet = await api.tweet_details(int(request["postId"]), kv={"includePromotedContent": False})
        return {"item": research_post(tweet) if tweet else None}
    if operation == "user":
        if "userId" in request:
            user = await api.user_by_id(int(request["userId"]))
        else:
            user = await api.user_by_login(request["handle"])
        return {"item": user_view(user) if user else None}
    if operation == "user_about":
        about = await api.user_about(request["handle"])
        return {"item": about_view(about) if about else None}
    if operation == "community":
        community = await api.community_info(int(request["communityId"]))
        return {"item": community_view(community) if community else None}

    key = ""
    if operation == "bookmarks":
        api, key = await bookmark_api(api, request["account"])
    cursor = read_cursor(request, key)
    variables = {"count": request.get("count", 10), "includePromotedContent": False}
    if cursor:
        variables["cursor"] = cursor
    options = {"limit": 1, "kv": variables}
    parser, view, accept, cursor_type = parse_tweets, research_post, None, "Bottom"

    match operation:
        case "search_posts":
            mode = request.get("mode", "latest")
            if mode == "trend":
                variables["querySource"] = "trend_click"
            variables["product"] = {"top": "Top", "media": "Media"}.get(mode, "Latest")
            pages = api.search_raw(request["query"], **options)
        case "search_users":
            variables["product"] = "People"
            pages = api.search_raw(request["query"], **options)
            parser, view = parse_users, user_view
        case "replies":
            post_id = int(request["postId"])
            pages = api.tweet_replies_raw(post_id, **options)
            accept = lambda item: item.inReplyToTweetId == post_id
            cursor_type = "ShowMoreThreads"
        case "conversation":
            post_id = int(request["postId"])
            focal = await api.tweet_details(post_id, kv={"includePromotedContent": False})
            if not focal:
                return {"items": [], "nextCursor": None}
            # 从会话根读取，避免焦点为回复时漏掉其他分支。
            pages = api.tweet_thread_raw(focal.conversationId, **options)
            accept = lambda item: item.conversationId == focal.conversationId
        case "user_posts":
            mode = request.get("mode", "posts")
            timeline = {
                "posts": api.user_tweets_raw,
                "posts_and_replies": api.user_tweets_and_replies_raw,
                "media": api.user_media_raw,
            }[mode]
            pages = timeline(int(request["userId"]), **options)
            if mode == "media":
                accept = lambda item: bool(item.media.photos or item.media.videos or item.media.animated)
        case "user_connections":
            connections = {
                "followers": api.followers_raw,
                "verified_followers": api.verified_followers_raw,
                "following": api.following_raw,
                "subscriptions": api.subscriptions_raw,
            }
            pages = connections[request["kind"]](int(request["userId"]), **options)
            parser, view = parse_users, user_view
        case "reposters":
            pages = api.retweeters_raw(int(request["postId"]), **options)
            parser, view = parse_users, user_view
        case "trends":
            pages = api.trends_raw(request.get("category", "trending"), **options)
            parser, view = parse_trends, trend_view
        case "community_posts":
            pages = api.community_tweets_raw(int(request["communityId"]), **options)
        case "community_people":
            timeline = api.community_members_raw if request["role"] == "members" else api.community_moderators_raw
            pages = timeline(int(request["communityId"]), **options)
            parser, view = parse_users, user_view
        case "list_posts":
            pages = api.list_timeline_raw(int(request["listId"]), **options)
        case "list_members":
            pages = api.list_members_raw(int(request["listId"]), **options)
            parser, view = parse_users, user_view
        case "bookmarks":
            pages = api.bookmarks_raw(**options)
        case _:
            raise ValueError("Unknown research operation")

    # 只读取一个原始页，保留上游返回的全部条目，避免截断后用下一页游标跳过条目。
    async with aclosing(pages):
        page = await anext(pages, None)
    if page is None:
        return {"items": [], "nextCursor": None}
    payload = page.json()
    entry = find_obj(payload, lambda item: item.get("cursorType") == cursor_type)
    next_value = entry.get("value") if entry else get_by_path(payload, "next_cursor")
    next_cursor = (
        f"{cursor_signature(request, next_value, key)}.{next_value}"
        if isinstance(next_value, str) and next_value and next_value != cursor else None
    )
    return {"items": [view(item) for item in parser(page, accept=accept)], "nextCursor": next_cursor}
