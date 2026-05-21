## **1. 文档信息**


| 项目   | 内容                            |
| ---- | ----------------------------- |
| 文档名称 | 支付回调API                       |
| 当前版本 | V1.0                          |
| 支付渠道 | 微信支付                          |
| 适用范围 | 用户小程序支付、退款、回调、对账              |
| 核心目标 | 定义支付创建、支付回调、支付失败、退款、退款回调和对账任务 |


---

## **2. 需要定义的能力**

需要定义：

1. 微信支付创建订单；
2. 支付成功回调；
3. 支付失败处理；
4. 退款申请；
5. 退款回调；
6. 对账任务。

---

## **3. 支付设计原则**

1. 前端支付成功不等于业务支付成功；
2. 订单最终支付状态以微信支付回调和服务端查询为准；
3. 支付回调必须验签；
4. 支付回调必须幂等；
5. 退款回调必须幂等；
6. 支付单和业务订单分离；
7. 所有支付状态变更需要记录日志；
8. 金额以分为单位；
9. 不允许前端传最终支付金额；
10. 对账任务用于修复异常状态。

---

## **4. 支付相关状态**

## **4.1 业务订单支付状态**

```
UNPAID        未支付
PAYING        支付中
PAID          已支付
PAY_FAILED    支付失败
REFUNDING     退款中
PART_REFUNDED 部分退款
REFUNDED      已退款
CLOSED        已关闭

```

---

## **4.2 支付单状态**

```
INIT          初始化
PAYING        支付中
SUCCESS       支付成功
FAILED        支付失败
CLOSED        已关闭

```

---

## **4.3 退款单状态**

```
INIT          初始化
PROCESSING    退款中
SUCCESS       退款成功
FAILED        退款失败
CLOSED        已关闭

```

---

## **5. API 通用响应格式**

```
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "req_xxx"
}

```

---

# **6. API 列表**

## **6.1 创建微信支付订单**

### **接口**

```
POST /api/payments/wechat/create

```

---

### **说明**

用户提交业务订单后，调用该接口创建微信支付单，返回小程序调起支付所需参数。

---

### **请求参数**

```
{
  "orderId": "order_10001",
  "payChannel": "WECHAT_MINIAPP"
}

```

---

### **字段说明**


| 字段         | 类型     | 必填  | 说明      |
| ---------- | ------ | --- | ------- |
| orderId    | string | 是   | 业务订单 ID |
| payChannel | string | 是   | 支付渠道    |


---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "paymentId": "pay_10001",
    "orderId": "order_10001",
    "outTradeNo": "P202501010001",
    "amount": 19900,
    "currency": "CNY",
    "wechatPayParams": {
      "timeStamp": "1735718400",
      "nonceStr": "abc123",
      "package": "prepay_id=wx201410272009395522657a690389285100",
      "signType": "RSA",
      "paySign": "xxxx"
    }
  },
  "requestId": "req_xxx"
}

```

---

### **处理逻辑**

```
校验用户登录
→ 查询业务订单
→ 校验订单状态为待支付
→ 计算服务端应付金额
→ 创建或复用支付单
→ 调用微信支付 JSAPI 下单
→ 保存 prepay_id
→ 返回前端支付参数

```

---

### **幂等规则**

同一个未支付业务订单重复调用：

1. 如果已有有效支付单，返回原支付单；
2. 如果支付单已过期或关闭，创建新支付单；
3. 不允许重复增加应付金额；
4. 不允许对已支付订单再次创建支付单。

---

## **6.2 查询支付状态**

### **接口**

```
GET /api/payments/{paymentId}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "paymentId": "pay_10001",
    "orderId": "order_10001",
    "outTradeNo": "P202501010001",
    "amount": 19900,
    "status": "SUCCESS",
    "transactionId": "4200000000202501011234567890",
    "paidAt": "2025-01-01T12:00:00+08:00"
  },
  "requestId": "req_xxx"
}

```

---

## **6.3 查询业务订单支付结果**

### **接口**

```
GET /api/orders/{orderId}/payment-status

```

---

### **说明**

前端支付完成后调用该接口查询订单最终状态。

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "orderId": "order_10001",
    "paymentStatus": "PAID",
    "orderStatus": "WAIT_ACCEPT"
  },
  "requestId": "req_xxx"
}

```

---

## **6.4 微信支付成功回调**

### **接口**

```
POST /api/callbacks/wechat/pay

```

---

### **说明**

微信支付平台支付结果通知接口。

---

### **微信回调示例，解密前**

```
{
  "id": "EV-2018022511223320873",
  "create_time": "2025-01-01T12:00:00+08:00",
  "resource_type": "encrypt-resource",
  "event_type": "TRANSACTION.SUCCESS",
  "summary": "支付成功",
  "resource": {
    "algorithm": "AEAD_AES_256_GCM",
    "ciphertext": "xxxx",
    "nonce": "xxxx",
    "associated_data": "transaction"
  }
}

```

---

### **解密后核心字段**

```
{
  "appid": "wx_appid",
  "mchid": "merchant_id",
  "out_trade_no": "P202501010001",
  "transaction_id": "4200000000202501011234567890",
  "trade_state": "SUCCESS",
  "trade_state_desc": "支付成功",
  "success_time": "2025-01-01T12:00:00+08:00",
  "amount": {
    "total": 19900,
    "payer_total": 19900,
    "currency": "CNY"
  },
  "payer": {
    "openid": "openid_xxx"
  }
}

```

---

### **响应给微信**

成功：

```
{
  "code": "SUCCESS",
  "message": "成功"
}

```

失败：

```
{
  "code": "FAIL",
  "message": "失败原因"
}

```

---

### **处理逻辑**

```
校验微信签名
→ 解密 resource
→ 根据 out_trade_no 查询支付单
→ 校验金额
→ 校验商户号和 appid
→ 幂等检查 transaction_id
→ 更新支付单为 SUCCESS
→ 更新业务订单为 PAID
→ 记录支付回调日志
→ 发送订单支付成功消息
→ 触发商家接单通知

```

---

### **幂等要求**

如果同一个 `transaction_id` 或 `out_trade_no` 多次回调：

1. 已处理成功则直接返回 SUCCESS；
2. 不重复更新订单；
3. 不重复发放奖励；
4. 不重复发送重要通知；
5. 不重复生成收益记录。

---

## **6.5 支付失败处理**

支付失败通常不会像支付成功一样强依赖回调，主要通过主动查询和订单超时关闭处理。

### **支付失败来源**

1. 用户取消支付；
2. 支付超时；
3. 微信支付失败；
4. 支付单关闭；
5. 对账发现未支付。

---

### **接口：关闭支付单**

```
POST /api/payments/{paymentId}/close

```

---

### **处理逻辑**

```
校验支付单状态
→ 调用微信关闭订单
→ 更新支付单 CLOSED
→ 如果业务订单仍未支付，更新为待支付或已取消

```

---

## **6.6 申请退款**

### **接口**

```
POST /api/refunds/apply

```

---

### **说明**

用户、商家或平台可在符合规则时申请退款。

---

### **请求参数**

```
{
  "orderId": "order_10001",
  "paymentId": "pay_10001",
  "refundAmount": 19900,
  "reason": "用户取消订单",
  "operatorType": "USER"
}

```

---

### **字段说明**


| 字段           | 类型     | 必填  | 说明                  |
| ------------ | ------ | --- | ------------------- |
| orderId      | string | 是   | 业务订单 ID             |
| paymentId    | string | 是   | 支付单 ID              |
| refundAmount | number | 是   | 退款金额，单位分            |
| reason       | string | 是   | 退款原因                |
| operatorType | string | 是   | USER/MERCHANT/ADMIN |


---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "refundId": "refund_10001",
    "outRefundNo": "R202501010001",
    "refundAmount": 19900,
    "status": "PROCESSING"
  },
  "requestId": "req_xxx"
}

```

---

### **处理逻辑**

```
校验订单存在
→ 校验支付单成功
→ 校验可退款金额
→ 校验退款权限和订单状态
→ 创建退款单
→ 调用微信退款接口
→ 更新退款单为 PROCESSING
→ 更新订单为 REFUNDING

```

---

### **退款规则**

1. 未支付订单不可退款；
2. 已全额退款订单不可重复退款；
3. 退款金额不能超过可退金额；
4. 退款必须记录原因；
5. 商家责任、用户责任、平台责任需区分；
6. 高金额退款可要求后台审核。

---

## **6.7 微信退款回调**

### **接口**

```
POST /api/callbacks/wechat/refund

```

---

### **解密后核心字段**

```
{
  "mchid": "merchant_id",
  "out_trade_no": "P202501010001",
  "transaction_id": "4200000000202501011234567890",
  "out_refund_no": "R202501010001",
  "refund_id": "5030000000202501011234567890",
  "refund_status": "SUCCESS",
  "success_time": "2025-01-01T12:30:00+08:00",
  "amount": {
    "total": 19900,
    "refund": 19900,
    "payer_total": 19900,
    "payer_refund": 19900
  }
}

```

---

### **响应给微信**

成功：

```
{
  "code": "SUCCESS",
  "message": "成功"
}

```

失败：

```
{
  "code": "FAIL",
  "message": "失败原因"
}

```

---

### **处理逻辑**

```
校验微信签名
→ 解密 resource
→ 根据 out_refund_no 查询退款单
→ 校验金额
→ 幂等检查 refund_id
→ 更新退款单状态
→ 更新支付单退款状态
→ 更新业务订单状态
→ 记录退款回调日志
→ 发送退款结果通知

```

---

## **6.8 查询退款状态**

### **接口**

```
GET /api/refunds/{refundId}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "refundId": "refund_10001",
    "orderId": "order_10001",
    "paymentId": "pay_10001",
    "outRefundNo": "R202501010001",
    "refundAmount": 19900,
    "status": "SUCCESS",
    "refundSuccessTime": "2025-01-01T12:30:00+08:00"
  },
  "requestId": "req_xxx"
}

```

---

## **6.9 对账任务**

### **说明**

对账任务用于发现和修复支付系统与微信支付之间的状态不一致。

---

### **定时任务**

```
每天凌晨 2:00 拉取前一天账单
每小时扫描最近 24 小时异常支付单
每小时扫描处理中退款单

```

---

### **对账内容**

1. 支付成功但订单未更新；
2. 订单已支付但微信无成功记录；
3. 退款成功但订单未退款；
4. 本地金额和微信金额不一致；
5. 回调未收到；
6. 支付单长期 PAYING；
7. 退款单长期 PROCESSING。

---

### **后台触发接口**

```
POST /api/admin/reconciliation/run

```

---

### **请求参数**

```
{
  "date": "2025-01-01",
  "type": "PAYMENT"
}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "recon_10001",
    "status": "RUNNING"
  },
  "requestId": "req_xxx"
}

```

---

## **7. 数据表建议**

## **7.1 payment_order**


| 字段             | 说明           |
| -------------- | ------------ |
| id             | 支付单 ID       |
| order_id       | 业务订单 ID      |
| out_trade_no   | 商户支付单号       |
| transaction_id | 微信支付单号       |
| pay_channel    | 支付渠道         |
| amount         | 支付金额，分       |
| currency       | 币种           |
| status         | 支付状态         |
| prepay_id      | 微信 prepay_id |
| payer_openid   | 支付用户 openid  |
| paid_at        | 支付成功时间       |
| expire_at      | 支付过期时间       |
| created_at     | 创建时间         |
| updated_at     | 更新时间         |


---

## **7.2 payment_callback_log**


| 字段              | 说明     |
| --------------- | ------ |
| id              | 日志 ID  |
| out_trade_no    | 商户支付单号 |
| transaction_id  | 微信支付单号 |
| event_type      | 回调事件   |
| raw_body        | 原始内容   |
| decrypted_body  | 解密内容   |
| signature_valid | 是否验签通过 |
| process_status  | 处理状态   |
| error_message   | 错误信息   |
| created_at      | 创建时间   |


---

## **7.3 refund_order**


| 字段            | 说明      |
| ------------- | ------- |
| id            | 退款单 ID  |
| order_id      | 业务订单 ID |
| payment_id    | 支付单 ID  |
| out_refund_no | 商户退款单号  |
| refund_id     | 微信退款单号  |
| refund_amount | 退款金额    |
| reason        | 退款原因    |
| status        | 退款状态    |
| success_time  | 退款成功时间  |
| operator_type | 操作人类型   |
| operator_id   | 操作人 ID  |
| created_at    | 创建时间    |
| updated_at    | 更新时间    |


---

## **7.4 refund_callback_log**


| 字段              | 说明     |
| --------------- | ------ |
| id              | 日志 ID  |
| out_refund_no   | 商户退款单号 |
| refund_id       | 微信退款单号 |
| raw_body        | 原始内容   |
| decrypted_body  | 解密内容   |
| signature_valid | 是否验签通过 |
| process_status  | 处理状态   |
| error_message   | 错误信息   |
| created_at      | 创建时间   |


---

## **8. 安全要求**

1. 微信支付回调必须验签；
2. 微信退款回调必须验签；
3. 回调解密失败必须记录；
4. 金额必须服务端计算；
5. 不信任前端金额；
6. 支付密钥不得写入代码；
7. 证书定期更新；
8. 回调接口不依赖用户登录；
9. 回调接口必须限制请求来源和验签；
10. 支付日志不可随意删除；
11. 支付和退款操作需要操作日志；
12. 后台退款权限需要严格控制。

---

## **9. P0 验收标准**

P0 必须满足：

1. 可创建微信支付订单；
2. 可返回小程序支付参数；
3. 支付成功回调可验签；
4. 支付成功回调可幂等处理；
5. 支付成功后业务订单状态正确更新；
6. 前端可查询支付结果；
7. 可申请退款；
8. 退款回调可验签；
9. 退款回调可幂等处理；
10. 退款成功后业务订单状态正确更新；
11. 支持支付回调日志；
12. 支持退款回调日志；
13. 支持支付单关闭；
14. 支持基础对账任务；
15. 支持后台查看支付和退款记录。

