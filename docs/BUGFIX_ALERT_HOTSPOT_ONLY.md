# Bugfix: Bật/Tắt cảnh báo chỉ cho điểm nóng

## Vấn đề
- Khi nói "bật cảnh báo" hoặc "tắt cảnh báo", bot xét cả 2 trạng thái (speedAlert + hotspotAlert)
- User chỉ muốn lệnh này ảnh hưởng đến **cảnh báo điểm nóng** (hotspotAlert)
- Cảnh báo tốc độ (speedAlert) không cần thiết và gây nhầm lẫn

## Giải pháp
1. **Xóa hoàn toàn** các lệnh cảnh báo tốc độ:
   - Intent: `SETTING_SPEED_ALERT_ON`, `SETTING_SPEED_ALERT_OFF`
   - Action: `ENABLE_SPEED_ALERT`, `DISABLE_SPEED_ALERT`

2. **Bật/Tắt cảnh báo chỉ xét hotspotAlert:**
   - `ENABLE_VIOLATION_ALERTS` → chỉ bật hotspotAlert
   - `DISABLE_VIOLATION_ALERTS` → chỉ tắt hotspotAlert

3. **Noop logic:**
   - `ENABLE_VIOLATION_ALERTS` + `hotspotAlertEnabled=true` → noop
   - `DISABLE_VIOLATION_ALERTS` + `hotspotAlertEnabled=false` → noop

## Files đã thay đổi

### Backend
1. **be/src/voice/types.ts**
   - Xóa `SETTING_SPEED_ALERT_ON`, `SETTING_SPEED_ALERT_OFF` khỏi IntentCode
   - Xóa `ENABLE_SPEED_ALERT`, `DISABLE_SPEED_ALERT` khỏi ActionCode

2. **be/src/voice/commands.ts**
   - Xóa 2 command definitions cho speed alert

3. **be/src/voice/screenActions.ts**
   - Xóa 2 screen actions cho speed alert

4. **be/src/ws/handfree-http.ts**
   - Sửa noop logic cho `ENABLE_VIOLATION_ALERTS`:
     ```typescript
     if (parsed.hotspotAlertEnabled === true) {
       // → NOOP
     }
     ```
   - Sửa noop logic cho `DISABLE_VIOLATION_ALERTS`:
     ```typescript
     if (parsed.hotspotAlertEnabled === false) {
       // → NOOP
     }
     ```
   - Xóa noop check cho `ENABLE_SPEED_ALERT` và `DISABLE_SPEED_ALERT`

### Frontend
5. **src/voice/types.ts**
   - Xóa `SETTING_SPEED_ALERT_ON`, `SETTING_SPEED_ALERT_OFF` khỏi IntentCode
   - Xóa `ENABLE_SPEED_ALERT`, `DISABLE_SPEED_ALERT` khỏi ActionCode

6. **src/voice/commands.ts**
   - Xóa 2 command definitions cho speed alert

7. **src/voice/screenActions.ts**
   - Xóa 2 screen actions cho speed alert

## Behavior mới

### Bật cảnh báo (hotspotAlert đang tắt)
```
User: "bật cảnh báo"
Bot: "Mình bật cảnh báo cho bạn rồi nhé, có tốc độ hay điểm nóng mình nhắc bạn liền."
→ Thực hiện action, bật hotspotAlert
```

### Bật cảnh báo (hotspotAlert đã bật)
```
User: "bật cảnh báo"
Bot: "Cảnh báo đang bật rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé."
→ NOOP, mở mic lại
```

### Tắt cảnh báo (hotspotAlert đang bật)
```
User: "tắt cảnh báo"
Bot: "Mình tắt cảnh báo cho bạn nhé?" (confirm)
User: "đồng ý"
Bot: "Mình tắt cảnh báo cho bạn rồi đấy, bạn nhớ giữ tốc độ giùm mình nhé."
→ Thực hiện action, tắt hotspotAlert
```

### Tắt cảnh báo (hotspotAlert đã tắt)
```
User: "tắt cảnh báo"
Bot: "Cảnh báo đang tắt rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé."
→ NOOP
```

## Testing
1. Restart backend để clear cache
2. Trên Android:
   - Set hotspotAlert = true
   - Nói "bật cảnh báo" → expect noop reply
   - Set hotspotAlert = false
   - Nói "bật cảnh báo" → expect action thực hiện
   - Nói "tắt cảnh báo" → expect noop reply
3. Verify speedAlert không ảnh hưởng đến kết quả

## Notes
- Lệnh "bật cảnh báo điểm nóng" (`SETTING_HOTSPOT_ALERT_ON`) vẫn còn cho specific use case
- Android app cần chỉ gửi `hotspotAlertEnabled` trong request, không cần `speedAlertEnabled` nữa
- Nếu sau này cần lại speedAlert, có thể thêm intent riêng "bật cảnh báo tốc độ"
