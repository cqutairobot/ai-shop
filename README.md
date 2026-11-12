# AI 商品展示网站

一个只做展示的店铺主页：访客看商品、看介绍，然后通过微信 / QQ 联系你购买。没有在线下单和支付。

- 前台：首页（公告、分类、搜索、商品卡片）和商品详情页，「极光 Aurora」风格，深色 / 浅色自动切换。
- 后台：在浏览器里增删改商品、改价格、上下架、管理分类、改店铺信息和主题色，手机上也能操作。
- 部署：一个轻量服务加一个 SQLite 数据库文件，用 Docker 一条命令启动，自动配置 HTTPS。

相关文档：[功能说明](docs/v1-features.md) · [UI 设计说明书](docs/ui-design.md) · [UI 预览页](docs/ui-preview.html)

## 部署到服务器

需要准备三样东西：

1. 一台装好 Docker 的服务器。没装的话执行：

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. 一个已经解析到这台服务器 IP 的域名。
3. 服务器的防火墙 / 安全组放行 80 和 443 端口。

然后按下面四步操作。

**第一步：下载代码**

```bash
git clone https://github.com/cqutairobot/ai-shop.git
```

```bash
cd ai-shop
```

**第二步：填写域名和后台密码**

```bash
cp .env.example .env
```

用编辑器打开 `.env`，把 `DOMAIN` 改成你的域名，`ADMIN_PASSWORD` 填一个自己记得住的密码。

**第三步：启动**

```bash
docker compose up -d --build
```

第一次启动需要几分钟下载和构建。

**第四步：打开网站**

- 网站：`https://你的域名`
- 后台：`https://你的域名/admin`，用第二步填的密码登录

第一次打开看到的是示例数据。到后台「店铺设置」最下面点「清空示例数据」，然后填写自己的店铺信息、联系方式和商品。

### 服务器上已经有 Nginx 或宝塔面板

这种情况下 80 和 443 端口已经被占用，不要启动自带的 Caddy。在项目目录里新建一个 `docker-compose.override.yml`：

```yaml
services:
  app:
    ports:
      - "127.0.0.1:3000:3000"
```

只启动网站本体：

```bash
docker compose up -d --build app
```

再在 Nginx / 宝塔里给域名添加反向代理，目标地址填 `http://127.0.0.1:3000`，并保留 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto` 这三个请求头（宝塔的反向代理默认会带上）。

## 日常维护

### 改商品和价格

登录后台，在「商品」列表里直接改价格和状态，改完自动保存。新增或修改图文详情点进商品里编辑。

图文详情的写法：

| 想要的效果 | 写法 | 也可以点工具栏的 |
|---|---|---|
| 小标题 | `## 标题文字` | 标题 |
| 加粗 | `**文字**` | 加粗 |
| 彩色重点 | `==文字==` | 重点 |
| 列表 | 每行以 `- ` 开头 | 列表 |
| 链接 | `[链接文字](https://网址)` | 链接 |
| 图片 | 点「插入图片」上传 | 插入图片 |
| 蓝色提示框 | `:::tip` 换行写内容，再换行写 `:::` | 提示框 |
| 橙色注意框 | `:::warn` 换行写内容，再换行写 `:::` | 注意框 |

### 备份

后台「店铺设置」最下面点「导出备份」，会下载一个压缩包，里面是全部商品、设置和图片。建议每次大改之后导出一份存在自己电脑上。

服务器上的 `data` 目录就是全部数据（`shop.db` 和 `uploads/`），直接拷贝这个目录也是一份完整备份。

### 恢复备份或搬到新服务器

1. 在新服务器上按「部署到服务器」做完前两步。
2. 把备份压缩包解压到项目的 `data` 目录里，解压后应该是 `data/shop.db` 和 `data/uploads/`。
3. 如果 `data` 目录里有 `shop.db-wal` 和 `shop.db-shm` 这两个旧文件，把它们删掉。
4. 执行 `docker compose up -d --build` 启动。后台密码和原来一样。

如果是在同一台服务器上恢复，先执行 `docker compose down` 停掉网站，再做第 2 到 4 步。

### 更新网站

```bash
git pull
```

```bash
docker compose up -d --build
```

数据在 `data` 目录里，更新不会影响它。

### 忘记后台密码

```bash
docker compose exec -u node app npm run -s reset-password
```

会生成并显示一个新密码，登录后到「店铺设置」里改成自己的。

### 查看运行日志

```bash
docker compose logs -f app
```

## 配置项

都写在 `.env` 文件里。

| 名称 | 说明 | 默认值 |
|---|---|---|
| `DOMAIN` | 你的域名，Caddy 用它申请 HTTPS 证书 | 必填 |
| `ADMIN_PASSWORD` | 后台初始密码，只在第一次启动时生效。留空会自动生成一个，在运行日志里可以看到 | 空 |

不用 Docker、直接用 Node 运行时还可以设置这些环境变量：

| 名称 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 监听端口 | `3000` |
| `DATA_DIR` | 数据目录 | `./data` |
| `TRUST_PROXY` | 前面有 Nginx / Caddy 时设为 `1`，用来识别访客真实 IP 和 HTTPS | 不设 |
| `SEED_DEMO` | 设为 `0` 时第一次启动不写入示例数据 | 写入 |

## 本地开发

需要 Node.js 22.13 或更高版本。

```bash
npm install
```

```bash
npm run dev
```

打开 `http://localhost:3000`。后台初始密码会显示在终端里。

```bash
npm test
```

### 目录结构

```
src/
  server.js        启动入口
  app.js           组装应用：静态资源、路由、首次启动
  store.js         数据库（SQLite）：商品、分类、设置、图片
  theme.js         主题色预设与派生色计算
  markdown.js      图文详情的渲染
  images.js        图片压缩与缩略图
  auth.js          密码、登录状态、登录限次
  zip.js           导出备份
  routes/          前台和后台的路由
  views/           页面模板
public/
  css/ js/ fonts/  前台和后台的样式、脚本、字体
test/              自动化测试
docs/              功能说明、UI 设计说明书、UI 预览页
```

技术选型：Node.js、[Hono](https://hono.dev)、Node 自带的 SQLite、[sharp](https://sharp.pixelplumbing.com)（图片处理）、[marked](https://marked.js.org)（详情渲染）。页面由服务端直接渲染，前台脚本和样式是手写的原生 JS / CSS，没有构建步骤。
