---
name: collection-research
description: 查询热点和 X 监控库，安排采集，研究 X 实时帖子、时间线、趋势和社区内容。
---

# 多来源采集与选题

## 查询与获取最新资料

- 查询本地热点和 X 推文时，直接调用 `get_messages`。一次可读取两个来源，使用返回的正文摘录和原文链接判断相关性。
- 确实需要平台热榜时使用 `list_rankings`。需要完整正文或 X 引用关系时，使用 `get_trend` 或 `get_x_tweet`。需要类别、收藏、监控目标或时间范围等专用筛选时，使用 `list_trends` 或 `list_x_tweets`。
- 查看采集状态时，使用 `get_trends_status` 查询热点来源，使用 `list_x_targets` 查询 X 监控目标。
- 需要更新资料时，用 `refresh_trends` 调度热点来源，用 `collect_x_now` 调度启用的 X 目标。刷新返回表示已排队，结合随后看到的采集状态和入库结果判断是否已更新。来源待登录时，引导用户到 CreatorStudio 设置管理凭据。
- 持续追踪 X 更新时，用 `add_x_target` 添加需要监控的账号。用户给出用户名时直接使用。用户只给出机构、人物或主题时，先搜索并根据资料确认相关账号，再用结果中的 `handle` 添加。采集间隔和补采范围只在任务有具体要求时传入。
- 热点来源从 `get_trends_status` 返回的来源中选择，用户要求启用时使用 `set_trend_source_enabled`。

## 实时研究 X

- 查指定话题用 `search_x_posts`，发现近期讨论选 `latest`，找有代表性的热门结果选 `top`。查作者用 `search_x_users` 或 `get_x_user`，再把返回的用户 ID 交给 `list_x_user_posts` 读该用户的时间线。已知 X List 或社区 ID 时，可以直接读取对应时间线。查当下热议话题用 `list_x_trends`，可再以 `trend` 模式搜索趋势的查询词。
- 判断帖子的传播表现时，用实际返回的浏览、点赞、评论和转发量，结合发布时间、作者和原文链接。缺失的指标不当作 0，也不要把 X 的热门排序表述为按浏览量排序。需要核查细节时用 `fetch_x_post`，需要讨论内容时用 `list_x_post_replies` 或 `get_x_conversation`。
- 分页时沿用同一工具和同一查询，只将返回的 `nextCursor` 放入下一次调用的 `cursor`。数据直接读取自 X，不会自动加入本地监控库。用户要读自己的书签时，用 `list_x_bookmarks` 并指定已配置的登录账号。X 首页推荐和关注信息流不在当前库的能力范围内。
