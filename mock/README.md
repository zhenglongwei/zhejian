# Mock 数据

开发期 mock 放于此目录，**文件头须注释** `// @mock-only`。

- `ENV.mode === 'mock'` 时，`services/request.js` 不发起真实请求。
- 页面通过 `services/*.js` 引用 mock，例如 `services/order.js` 内 `if (ENV.mode === 'mock') return require('../mock/order-detail')`。

联调：将 `services/config.js` 中 `mode` 改为 `dev` 并配置 `baseUrl`。
