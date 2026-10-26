# 蓝湾渔镇

蓝湾渔镇是一款使用 Babylon.js 制作的浏览器 3D 休闲游戏。玩家可以在海湾中钓鱼、收集木材与矿石、建造房屋、领养宠物、与居民交流，并通过可选的 WebSocket 房间同步在线玩家。

## 在线体验

[点击进入蓝湾渔镇在线演示](https://singapor876.github.io/blue-cove-game/)

在线演示提供完整单机玩法，不需要后端服务；多人同步功能需要另外启动 `server.js`。

## 本地运行

在项目目录启动一个静态文件服务器，然后访问 `index.html`。例如：

```powershell
npx serve .
```

也可以运行自带的 Node.js 服务：

```powershell
node server.js
```

## 主要功能

- 3D 海湾场景与角色移动
- 钓鱼和资源收集
- 建筑建造与升级
- 宠物领养
- NPC 互动
- 可选的多人在线同步
- 桌面端与移动端适配

## 技术组成

- HTML、CSS、JavaScript
- Babylon.js
- glTF Binary（`.glb`）模型
- Node.js 与 WebSocket（可选多人功能）

## 目录说明

- `index.html`：游戏入口
- `game.js`：主要游戏逻辑
- `styles.css`：界面样式
- `assets/models/`：3D 模型与资源清单
- `server.js`：本地静态服务及多人房间服务

