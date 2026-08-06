import type { IntentCode, ScreenAction, ScreenId } from './types';

export const screenActions: ScreenAction[] = [
  // ── Nhóm 1: Wake / Sleep / Help ──────────────────────────────────────────
  {
    intentCode: 'ASSISTANT_WAKE',
    screen: 'all',
    actionCode: 'OPEN_ASSISTANT',
    feedback: [
      'Mình nghe đây, bạn cần gì ạ?',
      'Mình nghe đây ạ.',
      'Mình nghe đây, bạn nói đi nhé.',
      'Có mình đây nè, bạn cần gì?',
      'Ờ, mình đang nghe, bạn cứ nói.',
      'Mình sẵn sàng rồi đó, bạn nói đi.',
      'Alo, mình đây, bạn cần gì nào?',
    ],
  },
  {
    intentCode: 'ASSISTANT_CLOSE',
    screen: 'all',
    actionCode: 'CLOSE_ASSISTANT',
    feedback: [
      'Mình tạm nghỉ đây ạ, cần gì bạn chạm vào nút trợ lý là mình nghe lại liền nhé.',
      'Mình nghỉ đây nha, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền.',
      'Mình tắt đây ạ, bạn lái an toàn nhé, có gì bạn chạm vào nút trợ lý là mình nghe.',
      'Ờ, mình nghỉ rồi đó, bạn cứ chạm vào nút trợ lý là mình nghe lại liền nha.',
      'Mình tạm dừng nhé, bạn đi đường cẩn thận, cần gì chạm nút trợ lý một cái là được.',
    ],
  },
  // ── ASSISTANT_HELP - Context-aware help per screen ─────────────────────
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'home',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể bật/tắt cảnh báo vi phạm, báo kẹt xe, tai nạn, hoặc đọc cảnh báo phía trước cho bạn nha.',
      'Bạn có thể bảo mình bật/tắt cảnh báo, báo kẹt xe, tai nạn, hoặc mở radio, tiện ích nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'radio',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể mở kênh nào bạn cần, hoặc chuyển kênh tiếp theo cho bạn nha.',
      'Bạn có thể bảo mình mở kênh nào đó, hoặc nói "kênh tiếp theo", "tạm dừng radio" nha.',
      'Bạn cứ nói tên kênh muốn nghe, hoặc bảo mình "chuyển kênh" là được nhé.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'utilities',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn mở Bảo hiểm xe cơ giới, tra cứu phạt nguội, hoặc tìm trạm xăng nha.',
      'Bạn có thể bảo mình mở bảo hiểm xe, tra phạt nguội, hoặc gọi cứu hộ nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'profile',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn bật/tắt cảnh báo giao thông hoặc mở các mục cài đặt tài khoản nha.',
      'Bạn có thể bảo mình bật/tắt cảnh báo, mở cài đặt hiển thị, hoặc quản lý quyền truy cập nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'community',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn vào kênh cộng đồng, tham gia nhóm, hoặc quay về trang chủ nha.',
      'Bạn có thể bảo mình vào kênh đầu tiên, tham gia nhóm, hoặc về trang chủ nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'notifications',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn quay về trang chủ, mở radio, hoặc vào tiện ích nha.',
      'Bạn có thể bảo mình về trang chủ, mở các mục khác như radio, tiện ích nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'fineLookup',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn kiểm tra phạt nguội ngay, chọn xe, hoặc xem lịch sử tra cứu nha.',
      'Bạn có thể bảo mình kiểm tra ngay, đổi xe, hoặc xem tất cả kết quả nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'fineResult',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn xem chi tiết lỗi, hướng dẫn nộp phạt, hoặc quay lại trang trước nha.',
      'Bạn có thể bảo mình xem chi tiết, hướng dẫn nộp phạt, hoặc quay lại nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'insurance',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn xem bảo hiểm trách nhiệm dân sự, bảo hiểm vật chất, hoặc mua bảo hiểm nha.',
      'Bạn có thể bảo mình xem bảo hiểm TNDS, bảo hiểm vật chất, hoặc bắt đầu mua nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'displaySettings',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn bật/tắt cảnh báo tốc độ, cảnh báo điểm nóng, hoặc quay lại nha.',
      'Bạn có thể bảo mình bật/tắt các loại cảnh báo, hoặc quay về trang trước nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'permissionSettings',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn bật/tắt vị trí, micro, hoặc quay lại nha.',
      'Bạn có thể bảo mình bật/tắt quyền truy cập vị trí, micro nha.',
    ],
  },
  {
    intentCode: 'ASSISTANT_HELP',
    screen: 'radioOnAir',
    actionCode: 'SHOW_HELP',
    feedback: [
      'Mình có thể giúp bạn bật/tắt mic, bật loa ngoài, hoặc rời phòng trò chuyện nha.',
      'Bạn có thể bảo mình tắt mic, bật loa, hoặc thoát phòng nha.',
    ],
  },

  // ── Nhóm 2: Navigation ───────────────────────────────────────────────────
  {
    intentCode: 'NAV_HOME',
    screen: 'radioOnAir',
    actionCode: 'OPEN_HOME_SCREEN',
    nextScreen: 'home',
    feedback: [
      'Mình rời phòng và đưa bạn về trang chủ rồi đây nhé.',
      'Mình thoát phòng và quay về trang chủ cho bạn nhé.',
      'Mình rời phòng cho bạn rồi, về trang chủ luôn nha.',
    ],
    requiresConfirmation: true,
    confirmPrompt: 'Mình rời phòng trò chuyện và về trang chủ cho bạn nhé?',
    riskLevel: 'caution',
  },
  {
    intentCode: 'NAV_HOME',
    screen: 'all',
    actionCode: 'OPEN_HOME_SCREEN',
    nextScreen: 'home',
    feedback: [
      'Mình đưa bạn về trang chủ rồi nha, bạn cần gì tiếp cứ bảo mình.',
      'Mình mở trang chủ cho bạn rồi đó, bạn muốn làm gì tiếp cứ nói nhé.',
      'Mình về màn chính cho bạn rồi đó, bạn cần gì nữa cứ kêu mình.',
      'Trang chủ đây rồi nè, bạn nói lệnh tiếp đi.',
    ],
  },
  {
    intentCode: 'NAV_RADIO',
    screen: 'all',
    actionCode: 'OPEN_RADIO_SCREEN',
    nextScreen: 'radio',
    feedback: [
      'Mình mở Radio cho bạn rồi đó, bạn muốn nghe kênh nào mình bật liền cho nhé?',
      'Radio đây rồi nè, bạn cứ đọc tên kênh hoặc chương trình, mình mở liền cho.',
      'Mình vào Radio cho bạn đây, bạn muốn nghe gì cứ bảo mình nha.',
      'Mình mở Radio cho bạn rồi ạ, bạn nói tên kênh là mình thao tác liền cho.',
    ],
  },
  {
    intentCode: 'NAV_UTILITIES',
    screen: 'all',
    actionCode: 'OPEN_UTILITIES_SCREEN',
    nextScreen: 'utilities',
    feedback: [
      'Mình mở Tiện ích cho bạn rồi nhé, bạn muốn dùng mục nào cứ nói, mình mở liền cho.',
      'Tiện ích đây rồi nè, bạn cần Bảo hiểm, Cứu hộ hay Trạm xăng cứ bảo mình nha.',
      'Mình mở Tiện ích cho bạn rồi đó, bạn muốn vào đâu cứ kêu mình một tiếng.',
    ],
  },
  {
    intentCode: 'NAV_COMMUNITY',
    screen: 'all',
    actionCode: 'OPEN_COMMUNITY_SCREEN',
    nextScreen: 'community',
    feedback: [
      'Mình mở Cộng đồng cho bạn rồi nhé, bạn muốn vào nhóm nào cứ đọc tên, mình tìm liền cho.',
      'Cộng đồng đây rồi nè, bạn cứ bảo mình vào nhóm nào là mình mở liền cho nha.',
      'Mình vào Cộng đồng cho bạn rồi đó, bạn cần xem nhóm gì cứ nói nhé.',
    ],
  },
  {
    intentCode: 'NAV_PROFILE',
    screen: 'all',
    actionCode: 'OPEN_PROFILE_SCREEN',
    nextScreen: 'profile',
    feedback: [
      'Mình mở Tài khoản cho bạn rồi nhé, lúc nào tiện bạn xem cũng được, có gì cứ bảo mình.',
      'Tài khoản của bạn đây rồi ạ, bạn cần đổi thông tin gì cứ nói, mình thao tác cho.',
      'Mình vào Tài khoản cho bạn rồi đó, có gì cứ kêu mình giúp nhé.',
    ],
  },
  {
    intentCode: 'NAV_NOTIFICATIONS',
    screen: 'all',
    actionCode: 'OPEN_NOTIFICATIONS_SCREEN',
    nextScreen: 'notifications',
    feedback: [
      'Bạn có {notificationCount} thông báo mới, mình đọc qua cho bạn nghe nhé?',
      'Mình mở Thông báo cho bạn rồi, có {notificationCount} cái mới, bạn muốn nghe mình đọc qua không?',
      'Thông báo của bạn đây ạ, có {notificationCount} mục mới, mình tóm tắt lướt qua cho bạn nghe nha?',
    ],
  },
  {
    intentCode: 'NAV_BACK',
    screen: 'all',
    actionCode: 'GO_BACK',
    feedback: [
      'Mình quay lại cho bạn rồi nha.',
      'Mình lùi một bước cho bạn đây.',
      'Mình lùi lại cho bạn rồi đó, bạn cần gì cứ bảo.',
    ],
  },

  // ── Nhóm 3: List navigation (bot tự cuộn, kèm offer voice readback) ─────
  {
    intentCode: 'LIST_SCROLL_DOWN',
    screen: 'all',
    actionCode: 'SCROLL_DOWN',
    feedback: [
      'Mình cuộn xuống cho bạn rồi nhé, có mục nào bạn muốn nghe mình đọc qua không?',
      'Mình kéo xuống tiếp cho bạn đây ạ, cần gì cứ kêu mình.',
      'Mình cuộn xuống cho bạn rồi đó, bạn muốn mình đọc tóm tắt mục đầu không?',
    ],
  },
  {
    intentCode: 'LIST_SCROLL_UP',
    screen: 'all',
    actionCode: 'SCROLL_UP',
    feedback: [
      'Mình kéo lên cho bạn rồi nhé, cần gì cứ bảo mình.',
      'Mình cuộn lên cho bạn đây ạ.',
      'Mình lên đầu cho bạn rồi đó, bạn muốn nghe mình đọc qua mục nào không?',
    ],
  },
  {
    intentCode: 'LIST_SELECT_1',
    screen: 'all',
    actionCode: 'SELECT_FIRST_ITEM',
    feedback: [
      'Mình chọn mục đầu cho bạn rồi nhé, mình đọc qua nội dung cho bạn nghe nha?',
      'Mục đầu đây rồi ạ, bạn muốn mình kể chi tiết cho nghe không?',
      'Mình chọn mục một cho bạn rồi đó, bạn cần thêm gì cứ bảo mình.',
    ],
  },
  {
    intentCode: 'LIST_SELECT_2',
    screen: 'all',
    actionCode: 'SELECT_SECOND_ITEM',
    feedback: [
      'Mình chọn mục hai cho bạn rồi nhé, mình đọc qua nội dung cho bạn nghe nha?',
      'Mục hai đây rồi ạ, bạn muốn mình kể chi tiết không?',
      'Mình chọn mục hai cho bạn rồi đó, bạn cần thêm gì cứ kêu mình.',
    ],
  },

  // ── Nhóm 4: Route (voice-first — bạn đọc, mình ghi cho) ──────────────────
  {
    intentCode: 'ROUTE_OPEN',
    screen: 'all',
    actionCode: 'OPEN_ROUTE_SCREEN',
    nextScreen: 'route',
    feedback: [
      'Mình mở Lộ trình cho bạn rồi đó, bạn cứ đọc điểm đi và điểm đến, mình ghi vào cho nhé.',
      'Lộ trình đây rồi nè, bạn nói nơi xuất phát và nơi đến, mình nhập liền cho.',
      'Mình mở Lộ trình cho bạn ạ, bạn báo điểm đi và điểm đến, mình thao tác giúp nhé.',
    ],
  },
  {
    intentCode: 'ROUTE_SET_HN_LS',
    screen: 'all',
    actionCode: 'SET_ROUTE_HN_LS',
    nextScreen: 'home',
    feedback: [
      'Mình đặt lộ trình Hà Nội đi Lạng Sơn cho bạn rồi nhé, bạn yên tâm đi đường.',
      'Lộ trình Hà Nội đến Lạng Sơn sẵn sàng cho bạn rồi đó.',
      'Mình đặt xong lộ trình cho bạn rồi ạ, có gì mình nhắc dọc đường nha.',
    ],
  },
  {
    intentCode: 'ROUTE_EDIT_ORIGIN',
    screen: 'all',
    actionCode: 'EDIT_ROUTE_ORIGIN',
    nextScreen: 'route',
    feedback: [
      'Mình mở ô điểm đi cho bạn rồi nè, bạn đọc nơi xuất phát, mình ghi vào cho nhé.',
      'Ô điểm đi đang mở rồi đó, bạn cứ nói nơi xuất phát, mình nhập liền cho.',
      'Mình chỉnh điểm đi cho bạn ạ, bạn báo nơi xuất phát, mình thao tác giúp nhé.',
    ],
  },
  {
    intentCode: 'ROUTE_EDIT_DESTINATION',
    screen: 'all',
    actionCode: 'EDIT_ROUTE_DESTINATION',
    nextScreen: 'route',
    feedback: [
      'Mình mở ô điểm đến cho bạn rồi nè, bạn đọc nơi muốn đến, mình ghi vào cho nhé.',
      'Ô điểm đến đang mở rồi đó, bạn nói địa điểm, mình thao tác liền cho.',
      'Mình chỉnh điểm đến cho bạn ạ, bạn báo nơi muốn tới, mình nhập giúp nhé.',
    ],
  },
  {
    intentCode: 'ROUTE_CLEAR',
    screen: 'all',
    actionCode: 'CLEAR_ROUTE',
    feedback: [
      'Mình xóa lộ trình cho bạn rồi nhé, cần đặt lại bạn cứ bảo mình.',
      'Mình đã xóa lộ trình rồi đó, bạn muốn lên lộ trình mới cứ kêu mình.',
      'Mình hủy lộ trình cho bạn rồi ạ, bạn cần gì tiếp cứ nói.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình xóa lộ trình của bạn nhé?', 'Mình xóa lộ trình cho bạn nha ạ?'],
    riskLevel: 'caution',
  },

  // ── Nhóm 5: Drive alerts (read-aloud — đã voice-first) ───────────────────
  {
    intentCode: 'DRIVE_READ_ALERTS',
    screen: 'home',
    actionCode: 'READ_DRIVE_ALERTS',
    feedback: [
      'Phía trước 500 mét có điểm nóng giao thông, giới hạn 45 km/h, bạn chú ý nhé.',
      '500 mét nữa có điểm nóng giao thông, tốc độ 45 km/h thôi nhé bạn.',
      'Cẩn thận nhé, 500 mét nữa có điểm nóng, giới hạn 45 km/h thôi đó.',
    ],
  },
  {
    intentCode: 'DRIVE_REPEAT_ALERT',
    screen: 'home',
    actionCode: 'REPEAT_DRIVE_ALERT',
    feedback: [
      'Mình nhắc lại: 500 mét nữa có điểm nóng, giới hạn 45 km/h thôi bạn nhé.',
      'Mình đọc lại nhé: điểm nóng cách 500 mét, tốc độ 45 km/h.',
    ],
  },

  // ── Nhóm 6: Safety / Violation alerts ────────────────────────────────────
  {
    intentCode: 'VIOLATION_ALERT_ON',
    screen: 'all',
    actionCode: 'ENABLE_VIOLATION_ALERTS',
    feedback: [
      'Mình bật cảnh báo cho bạn rồi nhé, có tốc độ hay điểm nóng mình nhắc bạn liền.',
      'Mình bật cảnh báo vi phạm cho bạn rồi đó, bạn yên tâm lái, có gì mình báo ngay.',
    ],
    requiresConfirmation: true,
    confirmPrompt: [
      'Mình bật cảnh báo cho bạn nha ạ?',
    ],
    riskLevel: 'caution',
  },
  {
    intentCode: 'VIOLATION_ALERT_OFF',
    screen: 'all',
    actionCode: 'DISABLE_VIOLATION_ALERTS',
    feedback: [
      'Mình tắt cảnh báo cho bạn rồi đấy, bạn nhớ giữ tốc độ giùm mình nhé.',
      'Mình đã tắt cảnh báo cho bạn rồi đó, bạn lái cẩn thận giùm mình nha.',
      'Mình tắt cảnh báo cho bạn ạ, cần bật lại bạn cứ kêu mình một tiếng.',
    ],
    requiresConfirmation: true,
    confirmPrompt: [
      'Mình tắt cảnh báo cho bạn nhé?',
      'Mình tắt cảnh báo cho bạn nha ạ?',
    ],
    confirmPromptByScreen: {
      displaySettings:
        'Mình tắt cảnh báo cho bạn nhé? Sau đó mình sẽ không nhắc tốc độ và điểm nóng nữa đâu.',
    },
    riskLevel: 'critical',
  },
  {
    intentCode: 'SETTING_SPEED_ALERT_ON',
    screen: 'all',
    actionCode: 'ENABLE_SPEED_ALERT',
    feedback: [
      'Mình bật báo tốc độ cho bạn rồi nhé, có gì mình nhắc bạn liền.',
      'Báo tốc độ đã bật cho bạn rồi đó, bạn yên tâm lái nhé.',
      'Mình mở báo tốc độ cho bạn ạ, mình theo dõi giúp bạn luôn nha.',
    ],
  },
  {
    intentCode: 'SETTING_SPEED_ALERT_OFF',
    screen: 'displaySettings',
    actionCode: 'DISABLE_SPEED_ALERT',
    feedback: [
      'Mình tắt báo tốc độ cho bạn rồi đấy, bạn nhớ giữ ga giùm mình nhé.',
      'Mình tắt báo tốc độ cho bạn rồi đó, đi đường bạn cẩn thận giùm mình nha.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình tắt báo tốc độ cho bạn nhé?', 'Mình tắt báo tốc độ cho bạn nha ạ?'],
    riskLevel: 'caution',
  },
  {
    intentCode: 'SETTING_HOTSPOT_ALERT_ON',
    screen: 'all',
    actionCode: 'ENABLE_HOTSPOT_ALERT',
    feedback: [
      'Mình bật báo điểm nóng cho bạn rồi nhé.',
      'Báo điểm nóng đang chạy cho bạn rồi đó, có gì mình kêu bạn liền.',
    ],
  },

  // ── Nhóm 7: Reports ──────────────────────────────────────────────────────
  {
    intentCode: 'REPORT_OPEN',
    screen: 'home',
    actionCode: 'OPEN_REPORT_DRAFT',
    feedback: [
      'Bạn muốn phản ánh kẹt xe, tai nạn hay chướng ngại vật, cứ đọc cho mình nhé?',
      'Mình mở phản ánh cho bạn rồi đó, bạn báo loại gì cứ nói: kẹt xe, tai nạn, hay chướng ngại vật?',
    ],
  },
  {
    intentCode: 'REPORT_TRAFFIC_JAM',
    screen: 'home',
    actionCode: 'DRAFT_TRAFFIC_JAM_REPORT',
    feedback: [
      'Mình ghi nhận kẹt xe cho cộng đồng rồi ạ, cảm ơn bạn đã chia sẻ.',
      'Mình gửi báo kẹt xe cho bạn rồi ạ, cảm ơn bạn nhiều nhé.',
      'Mình ghi nhận kẹt xe cho bạn rồi nhé, cảm ơn bạn.',
      'Ui, lại kẹt à, mình ghi cho bạn rồi đó, đi đường cẩn thận nha.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình báo kẹt xe ở đây cho bạn nhé?', 'Mình báo kẹt xe ở đây nha ạ?'],
    riskLevel: 'safe',
  },
  {
    intentCode: 'REPORT_ACCIDENT',
    screen: 'home',
    actionCode: 'DRAFT_ACCIDENT_REPORT',
    feedback: [
      'Mình ghi nhận tai nạn cho cộng đồng rồi ạ, cảm ơn bạn đã báo.',
      'Mình gửi báo tai nạn cho bạn rồi nhé, bạn đi cẩn thận nha.',
      'Mình đã báo tai nạn cho cộng đồng giùm bạn, cảm ơn bạn nhiều.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình báo tai nạn ở đây cho bạn nhé?', 'Mình báo tai nạn ở đây nha ạ?'],
    riskLevel: 'safe',
  },
  {
    intentCode: 'REPORT_OBSTACLE',
    screen: 'home',
    actionCode: 'DRAFT_OBSTACLE_REPORT',
    feedback: [
      'Mình ghi nhận chướng ngại vật cho bạn rồi ạ, cảm ơn bạn nhé.',
      'Mình gửi báo chướng ngại vật cho cộng đồng rồi đó, cảm ơn bạn đã chia sẻ.',
    ],
    requiresConfirmation: true,
    confirmPrompt: [
      'Mình báo chướng ngại vật ở đây cho bạn nhé?',
      'Mình báo chướng ngại vật cho bạn nha ạ?',
    ],
    riskLevel: 'safe',
  },
  {
    intentCode: 'REPORT_SUBMIT',
    screen: 'home',
    actionCode: 'SUBMIT_REPORT',
    feedback: [
      'Mình gửi phản ánh giúp bạn rồi ạ, cảm ơn bạn nhiều nhé.',
      'Mình gửi phản ánh cho bạn xong rồi nha, cảm ơn bạn.',
      'Mình gửi báo cho cộng đồng giùm bạn rồi đó.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình gửi phản ánh cho bạn nhé?', 'Mình gửi phản ánh cho bạn nha ạ?'],
    riskLevel: 'safe',
  },

  // ── Nhóm 8: Radio / Media ────────────────────────────────────────────────
  {
    intentCode: 'RADIO_PLAY',
    screen: 'all',
    actionCode: 'PLAY_RADIO',
    nextScreen: 'radio',
    feedback: [
      'Mình đã bật Radio GT365 cho bạn rồi đây, bạn nghe thoải mái nha.',
      'Mình mở Radio GT365 lên cho bạn rồi đó, vừa nghe vừa lái cẩn thận nhé.',
      'Radio GT365 đang chạy cho bạn rồi nè, cần đổi kênh cứ bảo mình.',
      'Mình bật Radio GT365 cho bạn rồi ạ, có gì cứ kêu mình một tiếng.',
    ],
  },
  {
    intentCode: 'RADIO_PAUSE',
    screen: 'all',
    actionCode: 'PAUSE_RADIO',
    feedback: [
      'Mình tắt đài cho bạn rồi nhé.',
      'Mình dừng Radio cho bạn đây ạ.',
      'Mình tạm dừng đài cho bạn rồi đó, cần nghe lại cứ bảo mình.',
      'Mình tắt Radio cho bạn rồi nè, có gì cứ kêu mình.',
    ],
  },
  {
    intentCode: 'RADIO_LIST_CHANNELS',
    screen: 'all',
    actionCode: 'LIST_RADIO_CHANNELS',
    feedback: [
      'Hiện tại có {availableChannels}. Bạn muốn nghe kênh nào?',
      'Mình có {availableChannels}. Bạn chọn kênh nào nhé?',
      'Các kênh đang có là {availableChannels}, bạn muốn nghe kênh gì?',
    ],
  },
  {
    intentCode: 'RADIO_PLAY_BY_NAME',
    screen: 'all',
    actionCode: 'PLAY_RADIO_BY_NAME',
    feedback: [
      'Đã chuyển sang kênh {channelName}.',
      'Mình mở kênh {channelName} cho bạn rồi nhé.',
      'Kênh {channelName} đây rồi, bạn nghe thoải mái nha.',
    ],
  },
  {
    intentCode: 'RADIO_CHANNEL_NEXT',
    screen: 'all',
    actionCode: 'SWITCH_NEXT_CHANNEL',
    feedback: [
      'Mình chuyển sang kênh khác cho bạn nhé.',
      'Mình đổi kênh cho bạn đây, nghe thử nha.',
      'Mình sang kênh khác cho bạn rồi đó, không thích bạn cứ bảo mình đổi tiếp.',
    ],
  },
  {
    intentCode: 'RADIO_CHANNEL_PREV',
    screen: 'all',
    actionCode: 'SWITCH_PREV_CHANNEL',
    feedback: [
      'Mình quay lại kênh trước cho bạn rồi nhé.',
      'Mình về kênh trước cho bạn đây ạ.',
      'Mình lùi lại kênh trước cho bạn rồi đó.',
    ],
  },
  {
    intentCode: 'MEDIA_NEXT',
    screen: 'radio',
    actionCode: 'PLAY_NEXT_CONTENT',
    feedback: [
      'Mình chuyển sang nội dung tiếp theo cho bạn nhé.',
      'Mình sang bài tiếp cho bạn đây ạ.',
      'Mình mở nội dung mới cho bạn rồi đó, nghe nha.',
    ],
  },
  {
    intentCode: 'MEDIA_NEXT',
    screen: 'fineResult',
    actionCode: 'SCROLL_NEXT_VIOLATION',
    feedback: [
      'Mình mở lỗi tiếp theo cho bạn xem nhé, có muốn mình đọc chi tiết không?',
      'Mình sang lỗi kế tiếp cho bạn đây ạ, mình đọc qua cho nghe nha?',
    ],
  },
  {
    intentCode: 'MEDIA_PREV',
    screen: 'radio',
    actionCode: 'PLAY_PREVIOUS_CONTENT',
    feedback: [
      'Mình quay lại nội dung trước cho bạn nhé.',
      'Mình về bài trước cho bạn đây ạ.',
    ],
  },
  {
    intentCode: 'RADIO_TALK_OPEN',
    screen: 'radio',
    actionCode: 'OPEN_RADIO_TALK',
    nextScreen: 'radioOnAir',
    feedback: [
      'Mình mở phòng trò chuyện với MC cho bạn rồi nhé, bạn cứ nói thoải mái.',
      'Mình đưa bạn vào phòng MC rồi đó, bạn nói gì MC nghe được luôn nha.',
      'Phòng trò chuyện sẵn sàng cho bạn rồi đó, bạn on-air được rồi nè.',
    ],
  },
  {
    intentCode: 'RADIO_MIC_MUTE',
    screen: 'radioOnAir',
    actionCode: 'MUTE_MIC',
    feedback: [
      'Mình tắt mic cho bạn rồi nhé, cần bật lại bạn cứ kêu một tiếng.',
      'Mình tắt mic phòng cho bạn đây ạ.',
      'Mình mute mic cho bạn rồi đó, không ai nghe được bạn đâu nhé.',
    ],
  },
  {
    intentCode: 'RADIO_MIC_UNMUTE',
    screen: 'radioOnAir',
    actionCode: 'UNMUTE_MIC',
    feedback: [
      'Mình bật mic cho bạn rồi, bạn nói được rồi nhé.',
      'Mic đã mở cho bạn rồi đó, bạn cứ nói thoải mái.',
      'Mình mở mic phòng cho bạn rồi ạ.',
    ],
  },
  {
    intentCode: 'RADIO_SPEAKER_ON',
    screen: 'radioOnAir',
    actionCode: 'ENABLE_SPEAKER',
    feedback: [
      'Mình bật loa ngoài cho bạn rồi nhé.',
      'Mình mở loa cho bạn đây ạ.',
      'Loa đã bật cho bạn rồi đó.',
    ],
  },
  {
    intentCode: 'RADIO_LEAVE_ROOM',
    screen: 'radioOnAir',
    actionCode: 'LEAVE_RADIO_ROOM',
    nextScreen: 'radio',
    feedback: [
      'Mình rời phòng cho bạn rồi nhé, quay về Radio đây.',
      'Mình thoát phòng trò chuyện cho bạn đây ạ.',
      'Mình về lại màn Radio cho bạn rồi đó.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình rời phòng cho bạn nhé?', 'Mình rời phòng cho bạn nha ạ?'],
    riskLevel: 'caution',
  },
  {
    intentCode: 'CONTENT_PLAY_ROAD_STORY',
    screen: 'all',
    actionCode: 'PLAY_ROAD_STORY',
    nextScreen: 'radio',
    feedback: [
      'Mình phát Chuyện dọc đường cho bạn đây nhé, nghe thư giãn nha.',
      'Chuyện dọc đường đang chạy cho bạn rồi nè.',
      'Mình bật Chuyện dọc đường cho bạn ạ, bạn nghe thoải mái nhé.',
    ],
  },
  {
    intentCode: 'CONTENT_PLAY_FRIENDS',
    screen: 'all',
    actionCode: 'PLAY_FRIENDS_CONTENT',
    nextScreen: 'radio',
    feedback: [
      'Mình phát Kết bạn bốn phương cho bạn nhé.',
      'Kết bạn bốn phương đã mở cho bạn rồi đó.',
      'Mình bật Kết bạn bốn phương cho bạn ạ, bạn nghe vui nha.',
    ],
  },

  // ── Nhóm 9: Fine lookup (voice-readback) ─────────────────────────────────
  {
    intentCode: 'FINE_OPEN',
    screen: 'all',
    actionCode: 'OPEN_FINE_LOOKUP',
    nextScreen: 'fineLookup',
    feedback: [
      'Mình tra phạt nguội cho bạn, xe {plate} đây ạ.',
      'Mình mở phạt nguội cho bạn, xe {plate} nhé.',
      'Mình tra phạt nguội xe {plate} cho bạn đây nhé.',
      'Xe {plate} hả, để mình check phạt nguội liền cho bạn nha.',
      'Ờ, phạt nguội xe {plate} đây, bạn chờ mình tra giúp chút nhé.',
    ],
  },
  {
    intentCode: 'FINE_CHECK_NOW',
    screen: 'home',
    actionCode: 'OPEN_FINE_LOOKUP_WITH_DEFAULT_VEHICLE',
    nextScreen: 'fineLookup',
    feedback: [
      'Mình tra phạt nguội xe {plate} cho bạn ngay đây ạ.',
      'Mình kiểm tra phạt nguội xe {plate} cho bạn nhé, chờ chút nha.',
      'Để mình check ngay xe {plate} cho bạn nè.',
    ],
  },
  {
    intentCode: 'FINE_CHECK_NOW',
    screen: 'fineLookup',
    actionCode: 'RUN_FINE_LOOKUP',
    nextScreen: 'fineResult',
    feedback: [
      'Xe {plate} của bạn có 1 lỗi chưa xử phạt, mình đọc chi tiết cho bạn nghe nha?',
      'Mình tra xong rồi ạ, xe {plate} có 1 lỗi, bạn muốn nghe mình đọc chi tiết không?',
      'Xe {plate} đây, 1 lỗi chưa xử phạt nè, bạn cứ bảo "đọc lỗi" là mình kể cho nghe.',
    ],
  },
  {
    intentCode: 'VEHICLE_SELECT',
    screen: 'fineLookup',
    actionCode: 'OPEN_VEHICLE_SELECTOR',
    feedback: [
      'Mình mở danh sách xe cho bạn rồi nhé, bạn muốn dùng xe biển số nào cứ đọc, mình chọn liền cho.',
      'Danh sách xe của bạn đây ạ, bạn đọc biển số hoặc tên xe, mình chuyển sang xe đó liền nhé.',
      'Mình lấy danh sách xe cho bạn rồi đó, bạn cứ kêu tên xe muốn dùng là mình đổi liền cho.',
    ],
  },
  {
    intentCode: 'FINE_VIEW_ALL',
    screen: 'fineLookup',
    actionCode: 'OPEN_FINE_RESULT_LIST',
    nextScreen: 'fineResult',
    feedback: [
      'Mình mở danh sách tất cả lỗi cho bạn rồi nhé, mình đọc qua từng lỗi cho bạn nghe nha?',
      'Tất cả lỗi của xe {plate} đây nè, bạn muốn mình kể từng lỗi cho nghe không?',
      'Mình lấy toàn bộ kết quả tra cứu cho bạn rồi, mình tóm tắt cho bạn nghe nhé?',
    ],
  },
  {
    intentCode: 'FINE_OPEN_DETAIL',
    screen: 'all',
    actionCode: 'OPEN_FINE_DETAIL',
    nextScreen: 'fineResult',
    feedback: [
      'Mình mở chi tiết lỗi cho bạn rồi, mình đọc qua cho bạn nghe nhé?',
      'Chi tiết lỗi đây rồi ạ, bạn muốn mình đọc to nội dung cho nghe không?',
      'Mình lấy chi tiết lỗi xong, mình kể lại cho bạn nghe nha, lúc dừng xe rồi bạn xem ảnh sau cũng được.',
    ],
  },
  {
    intentCode: 'FINE_PAYMENT_GUIDE',
    screen: 'fineResult',
    actionCode: 'OPEN_FINE_PAYMENT_GUIDE',
    feedback: [
      'Mình mở hướng dẫn nộp phạt cho bạn rồi, mình tóm tắt các bước cho bạn nghe nhé?',
      'Hướng dẫn nộp phạt đây ạ, bạn muốn mình đọc qua từng bước không?',
      'Mình mở hướng dẫn cho bạn rồi đó, mình đọc nhanh 3 bước chính cho bạn nắm trước nha.',
    ],
  },
  {
    intentCode: 'FINE_SUBSCRIBE_OPEN',
    screen: 'fineLookup',
    actionCode: 'OPEN_FINE_SUBSCRIBE',
    feedback: [
      'Mình mở đăng ký nhận báo phạt cho bạn rồi nè, bạn cứ đọc số xe và số điện thoại, mình điền vào cho nhé.',
      'Đăng ký báo phạt đây rồi đó, bạn đọc thông tin, mình ghi vào cho.',
    ],
  },

  // ── Nhóm 10: Utility (voice-readback / defer visual) ─────────────────────
  {
    intentCode: 'UTILITY_INSURANCE_OPEN',
    screen: 'all',
    actionCode: 'OPEN_INSURANCE_SCREEN',
    nextScreen: 'insurance',
    feedback: [
      'Mình mở Bảo hiểm cho bạn rồi đó, có gói TNDS bắt buộc và gói vật chất, bạn muốn nghe mình giới thiệu gói nào?',
      'Bảo hiểm đây rồi nè, bạn muốn tìm hiểu gói nào, mình đọc thông tin gói đó cho bạn nghe nha?',
      'Mình mở Bảo hiểm cho bạn ạ, bạn nói "TNDS" hoặc "vật chất", mình kể chi tiết gói cho nghe nhé.',
    ],
  },
  {
    intentCode: 'UTILITY_RESCUE_OPEN',
    screen: 'utilities',
    actionCode: 'OPEN_RESCUE_SERVICE',
    feedback: [
      'Mình mở Cứu hộ 24/7 cho bạn rồi nè, cần gọi bạn cứ bảo "gọi cứu hộ" là mình bấm số liền cho.',
      'Cứu hộ 24/7 đây rồi ạ, bạn cần thì kêu mình "gọi cứu hộ", mình quay số liền nhé.',
      'Mình mở Cứu hộ cho bạn rồi đó, có gì khẩn bạn cứ kêu mình gọi liền nha.',
    ],
  },
  {
    intentCode: 'UTILITY_GAS_OPEN',
    screen: 'utilities',
    actionCode: 'OPEN_GAS_SERVICE',
    feedback: [
      'Mình tìm trạm xăng gần bạn rồi đó, trạm gần nhất cách {nearestGasDistance}, mình dẫn đường tới đó nhé?',
      'Có trạm xăng gần bạn nè, cách {nearestGasDistance}, bạn muốn mình dẫn đường tới luôn không?',
      'Trạm xăng gần nhất cách {nearestGasDistance} ạ, mình mở dẫn đường cho bạn nha?',
    ],
  },
  {
    intentCode: 'UTILITY_REGISTRATION_OPEN',
    screen: 'utilities',
    actionCode: 'OPEN_REGISTRATION_SERVICE',
    feedback: [
      'Mình mở Đăng kiểm cho bạn rồi nè, khi nào bạn dừng xe rồi xem nha, có gì mình nhắc lại sau.',
      'Đăng kiểm đây rồi ạ, lúc tiện bạn xem thông tin nha, cần gì cứ bảo mình.',
    ],
  },
  {
    intentCode: 'UTILITY_CAR_VALUATION_OPEN',
    screen: 'utilities',
    actionCode: 'OPEN_CAR_VALUATION',
    feedback: [
      'Mình mở Định giá xe cho bạn rồi đó, bạn đọc tên hãng và năm sản xuất, mình tra giúp cho nhé.',
      'Định giá xe đây rồi ạ, bạn cần định giá xe nào cứ đọc thông tin, mình nhập vào cho.',
    ],
  },
  {
    intentCode: 'INSURANCE_VIEW_TNDS',
    screen: 'insurance',
    actionCode: 'FOCUS_INSURANCE_TNDS',
    feedback: [
      'Gói TNDS bắt buộc đây rồi nè, mình đọc qua điều kiện và giá cho bạn nghe nhé?',
      'Đây là gói TNDS bắt buộc ạ, bạn muốn mình tóm tắt nhanh quyền lợi và mức phí không?',
      'Mình mở gói TNDS cho bạn rồi đó, mình kể qua các điểm chính cho nghe, thấy ổn bạn cứ bảo mình mua giúp nha.',
    ],
  },
  {
    intentCode: 'INSURANCE_VIEW_PHYSICAL',
    screen: 'insurance',
    actionCode: 'FOCUS_INSURANCE_PHYSICAL',
    feedback: [
      'Gói bảo hiểm vật chất xe đây nè, mình tóm tắt quyền lợi cho bạn nghe nhé?',
      'Đây là gói bảo hiểm vật chất ạ, bạn muốn mình đọc qua mức phí và quyền lợi không?',
      'Mình mở gói vật chất cho bạn rồi đó, mình kể nhanh điểm chính cho nghe nha.',
    ],
  },
  {
    intentCode: 'INSURANCE_BUY',
    screen: 'insurance',
    actionCode: 'START_INSURANCE_BUY',
    feedback: [
      'Mình mở bước mua bảo hiểm cho bạn rồi đó, khi nào bạn dừng xe an toàn rồi mình hướng dẫn từng bước nhé.',
      'Mình chuẩn bị bước mua cho bạn rồi ạ, lúc tiện bạn dừng xe rồi mình cùng làm nha, không vội đâu.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình mở bước mua bảo hiểm cho bạn nhé?', 'Mình mở bước mua cho bạn nha ạ?'],
    riskLevel: 'critical',
  },

  // ── Nhóm 11: Community ───────────────────────────────────────────────────
  {
    intentCode: 'COMMUNITY_ENTER_FIRST',
    screen: 'community',
    actionCode: 'ENTER_FIRST_COMMUNITY',
    feedback: [
      'Mình đưa bạn vào Hội xe tải Tây Bắc rồi nhé.',
      'Mình vào Hội xe tải Tây Bắc cho bạn rồi đó.',
    ],
  },
  {
    intentCode: 'COMMUNITY_JOIN',
    screen: 'community',
    actionCode: 'JOIN_COMMUNITY',
    feedback: [
      'Mình gửi yêu cầu tham gia nhóm cho bạn rồi ạ, chờ ban quản trị duyệt nhé.',
      'Mình gửi yêu cầu tham gia cho bạn xong, chờ duyệt nha.',
    ],
    requiresConfirmation: true,
    confirmPrompt: ['Mình tham gia nhóm này cho bạn nhé?', 'Mình vào nhóm cho bạn nha ạ?'],
    riskLevel: 'safe',
  },

  // ── Nhóm 12: Profile / Settings (defer visual khi không gấp) ─────────────
  {
    intentCode: 'PROFILE_VEHICLE_MANAGE',
    screen: 'profile',
    actionCode: 'OPEN_VEHICLE_MANAGEMENT',
    feedback: [
      'Mình mở Quản lý phương tiện cho bạn rồi nhé, khi nào tiện bạn xem nha, cần đổi gì cứ bảo mình.',
      'Quản lý phương tiện đây rồi ạ, lúc dừng xe bạn xem cũng được, có gì kêu mình.',
    ],
  },
  {
    intentCode: 'SETTINGS_DISPLAY_OPEN',
    screen: 'all',
    actionCode: 'OPEN_DISPLAY_SETTINGS',
    nextScreen: 'displaySettings',
    feedback: [
      'Mình mở Thông báo và Hiển thị cho bạn rồi nhé, bạn muốn chỉnh gì cứ nói, mình thao tác cho.',
      'Cài đặt Thông báo và Hiển thị đây ạ, bạn cứ bảo mình bật tắt gì là mình làm liền.',
    ],
  },
  {
    intentCode: 'SETTINGS_PERMISSION_OPEN',
    screen: 'all',
    actionCode: 'OPEN_PERMISSION_SETTINGS',
    nextScreen: 'permissionSettings',
    feedback: [
      'Mình mở Quản lý quyền truy cập cho bạn rồi nhé, bạn cần bật tắt quyền nào cứ nói nha.',
      'Quyền truy cập đây rồi ạ, bạn cứ bảo mình bật hay tắt là mình thao tác liền cho.',
    ],
  },

  // ── Nhóm 13: Permission (wake word thay nút bấm) ─────────────────────────
  {
    intentCode: 'PERMISSION_LOCATION_ON',
    screen: 'permissionSettings',
    actionCode: 'ENABLE_LOCATION_PERMISSION',
    feedback: [
      'Mình bật vị trí cho bạn rồi nhé, bản đồ chạy được rồi đó.',
      'Vị trí đã bật cho bạn rồi đó, mình theo dõi tuyến đường giúp bạn luôn nha.',
    ],
  },
  {
    intentCode: 'PERMISSION_LOCATION_OFF',
    screen: 'permissionSettings',
    actionCode: 'DISABLE_LOCATION_PERMISSION',
    feedback: [
      'Mình tắt vị trí cho bạn rồi đấy, bản đồ sẽ không hoạt động nữa nha.',
      'Mình đã tắt vị trí cho bạn, cần bật lại bạn cứ kêu mình một tiếng.',
    ],
    requiresConfirmation: true,
    confirmPrompt: [
      'Mình tắt vị trí cho bạn nhé? Bản đồ sẽ dừng đó.',
      'Mình tắt vị trí cho bạn nha ạ?',
    ],
    riskLevel: 'caution',
  },
  {
    intentCode: 'PERMISSION_MIC_ON',
    screen: 'permissionSettings',
    actionCode: 'ENABLE_MIC_PERMISSION',
    feedback: [
      'Mình bật micro cho bạn rồi nhé, bạn cứ nói thoải mái mình nghe.',
      'Micro đã bật cho bạn rồi đó.',
    ],
  },
  {
    intentCode: 'PERMISSION_MIC_OFF',
    screen: 'permissionSettings',
    actionCode: 'DISABLE_MIC_PERMISSION',
    feedback: [
      'Mình tắt mic cho bạn rồi đấy, khi nào cần bạn vào cài đặt bật lại quyền mic rồi chạm nút trợ lý là mình nghe lại nhé.',
      'Mình đã tắt mic cho bạn ạ, lúc nào cần dùng lại bạn nhớ bật quyền mic rồi chạm vào nút trợ lý nhé.',
    ],
    requiresConfirmation: true,
    confirmPrompt: [
      'Mình tắt mic cho bạn nhé? Sau đó bạn phải bật lại quyền mic rồi chạm nút trợ lý để nói tiếp.',
      'Mình tắt mic cho bạn nha ạ?',
    ],
    riskLevel: 'critical',
  },

  // ── Nhóm 14: Confirm yes/no ──────────────────────────────────────────────
  {
    intentCode: 'CONFIRM_YES',
    screen: 'confirming',
    actionCode: 'CONFIRM_PENDING',
    feedback: ['Oke, mình làm liền cho bạn.', 'Vâng ạ, mình làm liền đây.', 'Mình thao tác liền cho bạn nhé.'],
  },
  {
    intentCode: 'CONFIRM_NO',
    screen: 'confirming',
    actionCode: 'CANCEL_PENDING',
    feedback: [
      'Oke, mình bỏ qua cho bạn nhé.',
      'Mình hủy lệnh này cho bạn nha.',
      'Mình không làm nữa đâu, bạn cần gì khác cứ bảo mình.',
    ],
  },
];

export function resolveAction(
  intentCode: IntentCode,
  screen: ScreenId,
  confirming: boolean,
): ScreenAction | undefined {
  if (confirming) {
    const confirmingAction = screenActions.find(
      (action) => action.intentCode === intentCode && action.screen === 'confirming',
    );
    if (confirmingAction) return confirmingAction;
  }

  return (
    screenActions.find((action) => action.intentCode === intentCode && action.screen === screen) ??
    screenActions.find((action) => action.intentCode === intentCode && action.screen === 'all')
  );
}
