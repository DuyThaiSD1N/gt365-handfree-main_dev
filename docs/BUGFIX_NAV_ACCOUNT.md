# Bugfix: Đổi NAV_PROFILE thành NAV_ACCOUNT

## Vấn đề
- Khi ở màn **home**, nói "mở tài khoản cho tôi", bot trả về `nextScreen: "account"` nhưng `intentCode: "NAV_PROFILE"` và `actionCode: "OPEN_PROFILE_SCREEN"`
- Android app có màn hình tên là **account** chứ không phải **profile**
- Mismatch này gây ra lỗi bot mất kết nối khi vào màn account

## Nguyên nhân
- Backend dùng tên `NAV_PROFILE` / `OPEN_PROFILE_SCREEN` trong khi màn hình thực tế Android là `account`
- Tên không nhất quán gây confusion và có thể gây lỗi khi Android parse response

## Giải pháp
Đổi tên intent và action cho khớp với tên màn hình thực tế:
- `NAV_PROFILE` → `NAV_ACCOUNT`
- `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`

## Files đã thay đổi

### Backend (be/)
1. **be/src/voice/types.ts**
   - `IntentCode`: `NAV_PROFILE` → `NAV_ACCOUNT`
   - `ActionCode`: `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`

2. **be/src/voice/commands.ts**
   - Intent code: `NAV_PROFILE` → `NAV_ACCOUNT`

3. **be/src/voice/screenActions.ts**
   - Intent code: `NAV_PROFILE` → `NAV_ACCOUNT`
   - Action code: `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`

4. **be/src/ws/handfree-http.ts**
   - `NOOP_OPEN_MIC_ACTIONS`: `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`
   - `SCREEN_NOOP_MAP`: `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`
   - `noopReplyFor()`: case `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`

### Frontend (src/)
5. **src/voice/types.ts**
   - `IntentCode`: `NAV_PROFILE` → `NAV_ACCOUNT`
   - `ActionCode`: `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`

6. **src/voice/commands.ts**
   - Intent code: `NAV_PROFILE` → `NAV_ACCOUNT`

7. **src/voice/screenActions.ts**
   - Intent code: `NAV_PROFILE` → `NAV_ACCOUNT`
   - Action code: `OPEN_PROFILE_SCREEN` → `OPEN_ACCOUNT_SCREEN`

## Response mới
```json
{
  "type": "action",
  "action": {
    "code": "OPEN_ACCOUNT_SCREEN",
    "nextScreen": "account"
  },
  "reply": "Tài khoản của bạn đây rồi ạ, bạn cần đổi thông tin gì cứ nói, mình thao tác cho.",
  "meta": {
    "intentCode": "NAV_ACCOUNT",
    "confidence": 1,
    "source": "matcher",
    "latencyMs": 15
  }
}
```

## Kiểm tra
1. Khởi động lại backend server để clear cache
2. Trên Android, ở màn **home**, nói: "mở tài khoản cho tôi"
3. Kiểm tra response có `intentCode: "NAV_ACCOUNT"` và `actionCode: "OPEN_ACCOUNT_SCREEN"`
4. Xác nhận bot không mất kết nối khi vào màn account

## Note
- Cần clear cache API (hoặc restart server) vì có cơ chế cache response
- Android app cần xử lý cả 2 action codes trong quá trình migration:
  - `OPEN_PROFILE_SCREEN` (old, deprecated)
  - `OPEN_ACCOUNT_SCREEN` (new)
