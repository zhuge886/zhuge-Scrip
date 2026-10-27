# SGCC 检查

运行 `npm ci`、`sh fetch-types.sh`、`npm run check` 和 `npm test`。

当前80项检查使用离线模拟，不请求真实国网账号。交费模块协议依据官方公开安装包，出处见 [payment-contract.json](payment-contract.json)；来源核对与离线检查不能证明首次未绑定户号查询已经成功。参见 [验证记录](../../sgcc-widget/VERIFICATION.md)。
