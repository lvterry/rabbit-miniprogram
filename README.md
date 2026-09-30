# 小兔排课

微信原生小程序，老师端课程、学员、排课、课时记录、收入报表、账号资料及反馈统一接入微信云托管 API，业务数据由 MySQL 保存。空账号从空数据开始，不再注入演示数据。

当前小程序版本：`0.1.0`（见根目录 `VERSION`，对应 Git Tag `v0.1.0`）。在微信开发者工具上传体验版代码时，版本号填写 `0.1.0`；Git Tag 不会自动设置微信平台上的上传版本号。

## 打开与使用

用微信开发者工具打开本目录。按「我的 → 我的课程」创建课程，在「学员」添加学员并关联课程，然后在学员详情添加课时及预约。预约会进入首页，也可以从学员详情进入课次详情。

课次支持改期、取消（扣次或不扣次）、恢复、完成、撤销完成及修改备注。每位学员每次授课扣 1 次，不按时长换算；余额不足时阻止整次扣次操作。恢复或撤销会追加返还流水，并保留操作历史。

增加课时中的「实收费用」表示已经收到的金额，未收款或赠送课时填 0。非零金额会与课时获取记录一起保存为收款记录；报表按北京时间的收款日期展示近六个自然月截至今天的收入，并按课程和月份汇总。当前没有退款或独立补收款页面。

微信云托管通过平台身份头识别当前用户，各用户的数据相互隔离；无需进入演示账号或另行填写 OpenID。手机号绑定代码已保留，但「我的」页面暂时隐藏账号入口，不会主动请求手机号授权。启用入口后，用户授权返回的手机号由服务端兑换并保存，页面只显示遮盖后的号码。业务数据继续按微信 OpenID 隔离，不按手机号合并账号。

本地存储仅用于保留未确认结果的写入请求标识，方便网络断开后重试；不用于保存业务数据或提供假数据回退。旧的 `xiaotu-prototype-v2` 本地数据不会上传。

## 后端与部署

`server/` 是 Express 服务。生产入口启动时连接 MySQL、创建新增数据表并迁移旧云端数据；配置缺失或数据库不可用时启动失败，不回退到内存。内存存储仅用于接口测试。

现有云托管环境：`prod-d8gfpc80m60219d51`；服务：`express-2wy2`。服务通过 GitHub 仓库的 `main` 分支自动构建部署。构建上下文/应用目录须为 `server/`，Dockerfile 为该目录下的 `Dockerfile`，容器端口 80。前端迁移及手机号绑定代码均已提交；手机号入口暂时隐藏。当前云端账号接口与提交 `6939647` 的响应结构一致，模拟器已重新读取学员、课次、课程和报表；真机完整操作链路仍待验收，见 [云端迁移清单](docs/CloudMigration.md)。

MySQL 环境变量：`MYSQL_ADDRESS`（支持 `host:port`）、`MYSQL_USERNAME`、`MYSQL_PASSWORD`；`MYSQL_DATABASE` 默认 `nodejs_demo`；也支持 `MYSQL_HOST`、`MYSQL_PORT`。密码只存于云托管环境变量，不提交仓库。数据库用户需要连接、建表和业务读写权限。

旧课程、学员、充值记录及预约会保留。一次性迁移将已有余额记为期初课时流水，将原充值费用导入收款表，将原预约转换为课次和独立预约；之后的变化写入新表。迁移事务失败会回滚，重复启动不重复导入，旧预约表保留作为历史来源。部署期间应避免旧版本服务继续接受充值和预约写入，因为旧版本只写旧表。部署后不要直接切回只读写旧预约表的服务版本。

部署完成可在开发者工具控制台运行 `getApp().testCloudConnection()` 检查健康。健康检查只证明服务可连通，完整验收步骤见 [云端迁移清单](docs/CloudMigration.md)。

本地启动：

```sh
cd server
npm ci
MYSQL_ADDRESS='数据库地址:端口' MYSQL_USERNAME='数据库用户名' MYSQL_PASSWORD='数据库密码' MYSQL_DATABASE='nodejs_demo' PORT=8080 npm start
```

## API

除 `GET /health` 外，接口要求云托管提供的 `X-WX-SOURCE` 和 `X-WX-OPENID`。服务应通过小程序 `wx.cloud.callContainer()` 访问；本地测试可自行添加测试身份头。

| 接口 | 行为 |
| --- | --- |
| `GET /health` | 健康检查 |
| `GET /courses`、`POST /courses` | 当前用户课程列表、创建课程 |
| `GET /courses/:id`、`PATCH /courses/:id` | 读取与编辑课程 |
| `GET /students`、`POST /students` | 当前用户学员列表、创建学员 |
| `GET /students/:id`、`PATCH /students/:id` | 资料、真实课时流水、预约及操作历史；编辑资料 |
| `POST /students/:id/credits` | 添加次数、记录实收金额（可为 0） |
| `POST /students/:id/appointments` | 为关联课程的学员创建课次和预约 |
| `GET /sessions?from=YYYY-MM-DD&to=YYYY-MM-DD` | 按日期读取课次；默认今天及以后 |
| `POST /sessions` | 为一门课程创建含多位学员的课次（所有学员须关联该课程） |
| `GET /sessions/:id` | 课次、各学员余额、扣次结果和操作记录 |
| `POST /sessions/:id/actions` | 改期、取消、恢复、完成、撤销、备注 |
| `GET /reports/revenue` | 按真实收款汇总近六个月收入 |
| `GET /me`、`POST /me/phone` | 读取脱敏账号资料及通过微信临时凭证绑定手机号 |
| `POST /feedback` | 保存意见反馈 |

课程字段：`name` 必填、最多 40 字，`description` 最多 500 字；同一用户课程名不可重复。学员字段：`name` 必填、最多 40 字，`courseId` 可空；创建备注最多 200 字，编辑备注最多 300 字。次数 `amount` 为 1–1000 整数；`fee` 为非负金额、最多两位小数且不超过 99,999,999.99 元。

预约字段：`date`、`start`、`end`；`endDate` 选填，仅允许当天或次日，时长大于 0 且不超过 24 小时；新预约及改期不允许选择北京时间今天之前的日期。备注最多 200 字。

写入重试使用 `requestId`（16–80 位字母、数字或连字符）。新增课次、课次操作及反馈必填；充值和单学员预约为兼容旧客户端可选，新小程序始终传入。同一用户的相同请求标识重复执行会返回原结果，标识复用但参数不同返回 409。课次操作还必须传入当前 `version`，避免不同请求同时扣次或旧操作在状态恢复后再次生效。

课次操作字段 `action` 为 `reschedule`、`cancel`、`restore`、`complete`、`uncomplete`、`editNote`；取消的 `consumeCredit` 必须是布尔值；`actionNote` 为操作备注，`note` 为授课备注。余额不足返回 409 / `INSUFFICIENT_CREDITS`，状态或版本冲突返回 409 / `SESSION_CONFLICT`。

## 验证

```sh
cd server
npm test
# 连接独立的本地测试数据库实例，自动创建并销毁 rabbit_test_* 数据库：
RABBIT_TEST_MYSQL_SOCKET='/测试实例/mysql.sock' npm test
```

数据库测试使用 MySQL 驱动，可在 MySQL 或兼容 MariaDB 实例执行；未提供测试 socket 时跳过数据库集成测试。本次在独立 MariaDB 实例验证了 MySQL 存储适配器的事务、幂等、余额一致性、旧数据迁移及重启持久化。前端调用链测试同时覆盖首页、学员详情、课次操作、账号资料、收入报表、反馈和网络失败重试。

学员邀请认领、多课程选课、课时到期、退款及独立收款为后续业务扩展，见 [Domain Model](docs/DomainModel.md)。

### 微信手机号登录配置

- 前端使用 `button open-type="getPhoneNumber"`，只把用户授权返回的临时 `code` 发到服务端；不接受客户端提交的原始手机号。
- 云托管「微信开放能力 / 开放接口服务」需允许 `phonenumber.getPhoneNumber`（`/wxa/business/getuserphonenumber`）；小程序主体也须具备并开通该能力。具体可用资格、额度及隐私说明按微信后台当前要求设置。
- 服务端使用微信云托管自动挂载的 `/.tencentcloudbase/wx/cloudbase_access_token`；不需要把 AppSecret 写入前端。`WECHAT_APP_ID` 默认是本项目 AppID，更换小程序时需同步设置；`WECHAT_TOKEN_PATH` 仅用于调整云托管令牌挂载路径。
- 启动时为旧 `accounts` 表增补 `phone_number`、`phone_country_code` 字段；保留原有记录和业务数据。API 只返回 `loggedIn` 和 `phoneMasked`，不会返回完整号码、昵称或头像。
- 微信授权弹窗和真实手机号兑换需使用具备该能力的小程序真机验证；本地测试通过注入的兑换结果验证成功、取消、失败、脱敏和账号隔离。
