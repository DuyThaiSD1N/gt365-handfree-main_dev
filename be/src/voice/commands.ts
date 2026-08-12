import type { CommandDefinition, IntentCode, ScreenId } from './types.js';

export const listScreens: ScreenId[] = [
  'home',
  'radio',
  'utilities',
  'community',
  'profile',
  'notifications',
  'fineLookup',
  'fineResult',
  'insurance',
];

export const commands: CommandDefinition[] = [
  {
    intentCode: 'ASSISTANT_WAKE',
    phrases: [
      'gt365 ơi',
      'trợ lý ơi',
      'alo gt365',
      'này gt365',
      'mở trợ lý',
      'bật trợ lý',
      'nghe lệnh',
      'gt365 nghe đây',
      'trợ lý nghe đây',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 4,
  },
  {
    intentCode: 'ASSISTANT_CLOSE',
    phrases: [
      'đóng trợ lý',
      'tắt trợ lý',
      'ngủ đi',
      'nghỉ đi gt365',
      'thoát trợ lý',
      'dừng nghe',
      'đủ rồi gt365',
      'thôi nhé',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 4,
  },
  {
    intentCode: 'ASSISTANT_HELP',
    phrases: ['trợ giúp', 'có thể nói gì', 'hướng dẫn lệnh', 'lệnh hỗ trợ'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_HOME',
    phrases: [
      'về trang chủ',
      'mở trang chủ',
      'trang chủ',
      'quay về trang chủ',
      'về home',
      'về màn chính',
      'ra trang chủ',
      'đưa tôi về trang chủ',
      'thoát ra trang chủ',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_RADIO',
    phrases: ['mở radio', 'vào radio', 'mở nội dung số', 'nghe radio'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_UTILITIES',
    phrases: ['mở tiện ích', 'vào tiện ích', 'dịch vụ tiện ích'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_COMMUNITY',
    phrases: ['mở cộng đồng', 'vào cộng đồng', 'xem cộng đồng'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_PROFILE',
    phrases: ['mở tài khoản', 'vào tài khoản', 'mở profile', 'hồ sơ của tôi'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_NOTIFICATIONS',
    phrases: ['mở thông báo', 'xem thông báo', 'thông báo'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'NAV_BACK',
    phrases: ['quay lại', 'trở lại', 'lùi lại'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'LIST_SCROLL_DOWN',
    phrases: ['cuộn xuống', 'kéo xuống', 'xem thêm bên dưới'],
    allowedScreens: listScreens,
    dangerLevel: 'safe',
  },
  {
    intentCode: 'LIST_SCROLL_UP',
    phrases: ['cuộn lên', 'kéo lên', 'xem bên trên'],
    allowedScreens: listScreens,
    dangerLevel: 'safe',
  },
  {
    intentCode: 'LIST_SELECT_1',
    phrases: ['chọn mục đầu tiên', 'chọn mục số một', 'chọn cái đầu tiên'],
    allowedScreens: listScreens,
    dangerLevel: 'safe',
  },
  {
    intentCode: 'LIST_SELECT_2',
    phrases: ['chọn mục thứ hai', 'chọn mục số hai', 'chọn cái thứ hai'],
    allowedScreens: listScreens,
    dangerLevel: 'safe',
  },
  {
    intentCode: 'ROUTE_OPEN',
    phrases: ['nhập lộ trình', 'mở lộ trình', 'đặt lộ trình'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'ROUTE_SET_HN_LS',
    phrases: ['đặt lộ trình từ hà nội đến lạng sơn', 'đi từ hà nội đến lạng sơn'],
    allowedScreens: ['home', 'route'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'ROUTE_EDIT_ORIGIN',
    phrases: ['đổi điểm đi', 'sửa điểm đi'],
    allowedScreens: ['home', 'route'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'ROUTE_EDIT_DESTINATION',
    phrases: ['đổi điểm đến', 'sửa điểm đến'],
    allowedScreens: ['home', 'route'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'ROUTE_CLEAR',
    phrases: ['xóa lộ trình', 'bỏ lộ trình', 'hủy lộ trình'],
    allowedScreens: ['home', 'route'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'DRIVE_READ_ALERTS',
    phrases: ['có gì phía trước', 'phía trước có gì', 'đọc cảnh báo phía trước'],
    allowedScreens: ['home'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'DRIVE_REPEAT_ALERT',
    phrases: ['nhắc lại cảnh báo', 'đọc lại cảnh báo'],
    allowedScreens: ['home'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'VIOLATION_ALERT_ON',
    phrases: [
      'bật cảnh báo vi phạm',
      'bật cảnh báo',
      'mở cảnh báo',
      'bật cảnh báo giao thông',
      'cho cảnh báo lại',
      'mở lại cảnh báo',
    ],
    allowedScreens: 'all',
    dangerLevel: 'confirm',
    priority: 1,
  },
  {
    intentCode: 'VIOLATION_ALERT_OFF',
    phrases: [
      'tắt cảnh báo vi phạm',
      'tắt cảnh báo',
      'tắt hết cảnh báo',
      'im cảnh báo đi',
      'đừng cảnh báo nữa',
      'ngưng cảnh báo',
    ],
    allowedScreens: 'all',
    dangerLevel: 'confirm',
    priority: 1,
  },
  {
    intentCode: 'SETTING_HOTSPOT_ALERT_ON',
    phrases: ['bật cảnh báo điểm nóng', 'mở cảnh báo điểm nóng', 'bật báo điểm nóng'],
    allowedScreens: ['home', 'displaySettings'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'REPORT_OPEN',
    phrases: ['phản ánh điểm nóng', 'mở phản ánh giao thông'],
    allowedScreens: ['home'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'REPORT_TRAFFIC_JAM',
    phrases: ['báo kẹt xe', 'báo ùn tắc', 'phản ánh kẹt xe'],
    allowedScreens: ['home'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'REPORT_ACCIDENT',
    phrases: ['báo tai nạn', 'phản ánh tai nạn'],
    allowedScreens: ['home'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'REPORT_OBSTACLE',
    phrases: ['báo chướng ngại vật', 'báo vật cản'],
    allowedScreens: ['home'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'REPORT_SUBMIT',
    phrases: ['gửi phản ánh', 'xác nhận phản ánh'],
    allowedScreens: ['home'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'RADIO_PLAY',
    phrases: [
      'phát radio',
      'bật radio',
      'mở radio lên',
      'cho nghe radio',
      'mở đài',
      'mở đài lên',
      'nghe đài',
      'mở nhạc',
      'cho nghe nhạc',
      'mở nội dung',
      'tiếp tục phát',
      'phát tiếp',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_PLAY_BY_NAME',
    phrases: [
      'kênh',
      'chuyên mục',
      'channel',
      'chuyển sang tin',
      'mở kênh',
      'bật kênh',
      'nghe kênh',
      'chuyển kênh',
      'đổi kênh',
      'phát kênh',
      'vào kênh',
      'cho tôi kênh',
      'cho kênh',
      'mở chuyên mục',
      'bật chuyên mục',
      'nghe chuyên mục',
      'cho tôi chuyên mục',
      'cho chuyên mục',
      'mở channel',
      'bật channel',
      'nghe channel',
      'cho tôi channel',
      'cho channel',
      'chuyển sang',
      'đổi sang',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 8,
  },
  {
    intentCode: 'RADIO_PAUSE',
    phrases: [
      'tắt radio',
      'tắt đài',
      'dừng radio',
      'dừng đài',
      'tạm dừng',
      'tạm dừng radio',
      'im radio',
      'ngưng phát',
      'dừng nhạc',
      'đủ rồi tắt đi',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_LIST_CHANNELS',
    phrases: [
      // Hỏi trực tiếp
      'có những kênh nào',
      'có kênh gì',
      'có mấy kênh',
      'có bao nhiêu kênh',
      'kênh nào có sẵn',
      'radio có kênh nào',
      'có những kênh radio nào',
      'kênh radio có gì',

      // Xin danh sách
      'danh sách kênh',
      'danh sách các kênh',
      'danh sách kênh radio',
      'cho tôi danh sách kênh',
      'cho tôi xem danh sách kênh',
      'cho xem danh sách kênh',
      'xem danh sách kênh',
      'cho tôi danh sách các kênh',
      'cho tôi xem danh sách các kênh',
      // BỎ: 'mình xem danh sách kênh được không', // ❌ Conflict với "không"
      'mình xem danh sách kênh được chứ',  // ✅ Thay thế
      'cho mình xem danh sách kênh',
      'cho mình danh sách kênh',

      // Liệt kê / kể tên
      'liệt kê kênh',
      'liệt kê channel',
      'kể tên các kênh',
      'tên các kênh',
      'các kênh radio',
      'các kênh có sẵn',
      'list kênh',
      'list channel',

      // Hỏi gợi ý nghe
      'nghe kênh nào bây giờ',
      'nên nghe kênh nào',
      // BỎ: 'có kênh nào hay không', // ❌ Conflict với "không"
      'có kênh nào hay',  // ✅ Thay thế
      'kênh nào đang phát',
      'đang có kênh gì',
      'hôm nay có kênh gì',
      'cho tôi biết có kênh gì',
      'giới thiệu kênh cho tôi',
      'kênh nào đang có',

      // Nói ngắn / tự nhiên
      'kênh có gì',
      'radio có gì',
      // BỎ: 'có gì nghe không', // ❌ Bị conflict với "không" (CONFIRM_NO)
      'có gì để nghe',  // ✅ Thay thế
      'kênh gì',
      'mấy kênh vậy',
      'bao nhiêu kênh',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 9,
  },
  {
    intentCode: 'RADIO_CHANNEL_NEXT',
    phrases: [
      // Chuyển kênh
      'chuyển kênh tiếp theo',
      'chuyển sang kênh tiếp theo',
      'chuyển kênh kế tiếp',
      'chuyển sang kênh kế tiếp',
      'chuyển kênh khác',
      'chuyển sang kênh khác',
      // Chuyên mục / tin / channel
      'chuyển tin tiếp theo',
      'chuyển sang tin tiếp theo',
      'chuyển chuyên mục tiếp theo',
      'chuyển sang chuyên mục tiếp theo',
      'chuyển channel tiếp theo',
      'chuyển sang channel tiếp theo',
      // Nói ngắn
      'kênh tiếp theo',
      'kênh kế tiếp',
      'tin tiếp theo',
      'chuyên mục tiếp theo',
      'channel tiếp theo',
      'sang kênh khác',
      'sang tin khác',
      'sang chuyên mục khác',
      // Tự nhiên khi lái xe
      'đổi kênh đi',
      'đổi kênh khác đi',
      'đổi kênh cho tôi',
      'đổi sang kênh khác',
      'cho tôi kênh khác',
      'cho mình kênh khác',
      'bật kênh khác',
      'mở kênh khác',
      'nghe kênh khác',
      'kênh khác đi',
      'chuyển đi',
      'đổi đi',
      'next kênh',
      'skip kênh',
      // Từ đơn
      'next',
      'tiếp',
      'skip',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 10,
  },
  {
    intentCode: 'RADIO_CHANNEL_PREV',
    phrases: [
      // Chuyển kênh trước
      'chuyển sang kênh trước',
      'chuyển kênh trước',
      'chuyển về kênh trước',
      'chuyển lại kênh trước',
      'chuyển kênh trước đó',
      'chuyển sang kênh trước đó',
      // Chuyên mục / tin / channel
      'chuyển tin trước',
      'chuyển sang tin trước',
      'chuyển về tin trước',
      'chuyển chuyên mục trước',
      'chuyển sang chuyên mục trước',
      'chuyển về chuyên mục trước',
      'chuyển channel trước',
      'chuyển sang channel trước',
      // Nói ngắn
      'kênh trước',
      'tin trước',
      'chuyên mục trước',
      'channel trước',
      'kênh lúc nãy',
      'tin lúc nãy',
      'chuyên mục lúc nãy',
      // Quay lại / lùi
      'quay lại kênh trước',
      'quay lại tin trước',
      'quay lại chuyên mục trước',
      'lùi lại kênh trước',
      'lùi lại tin trước',
      // Tự nhiên khi lái xe
      'về kênh cũ',
      'về kênh lúc nãy',
      'quay lại kênh cũ',
      'kênh vừa rồi',
      'kênh nãy',
      'kênh trước đó',
      'cho mình kênh trước',
      'cho tôi kênh trước',
      'back kênh',
      // Từ đơn
      'previous',
      'prev',
      'back',
      'lùi',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 10,
  },
  {
    intentCode: 'MEDIA_NEXT',
    phrases: ['tiếp theo', 'bài tiếp theo', 'chuyển bài'],
    allowedScreens: ['radio', 'fineResult'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'MEDIA_PREV',
    phrases: ['bài trước', 'quay lại bài trước', 'nội dung trước'],
    allowedScreens: ['radio'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_TALK_OPEN',
    phrases: ['trò chuyện với mc', 'nói chuyện với mc', 'vào phòng trò chuyện'],
    allowedScreens: ['radio'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_MIC_MUTE',
    phrases: ['tắt mic', 'tắt micro'],
    allowedScreens: ['radioOnAir'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_MIC_UNMUTE',
    phrases: ['bật mic', 'bật micro'],
    allowedScreens: ['radioOnAir'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_SPEAKER_ON',
    phrases: ['bật loa', 'mở loa ngoài'],
    allowedScreens: ['radioOnAir'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'RADIO_LEAVE_ROOM',
    phrases: ['rời phòng', 'thoát phòng trò chuyện'],
    allowedScreens: ['radioOnAir'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'CONTENT_PLAY_ROAD_STORY',
    phrases: ['nghe chuyện dọc đường', 'mở chuyện dọc đường'],
    allowedScreens: ['home', 'radio'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'CONTENT_PLAY_FRIENDS',
    phrases: ['nghe kết bạn bốn phương', 'mở kết bạn bốn phương'],
    allowedScreens: ['home', 'radio'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'FINE_OPEN',
    phrases: ['tra cứu phạt nguội', 'mở phạt nguội', 'kiểm tra phạt nguội'],
    allowedScreens: 'all',
    dangerLevel: 'safe',
    priority: 2,
  },
  {
    intentCode: 'FINE_CHECK_NOW',
    phrases: ['kiểm tra ngay', 'tra cứu ngay'],
    allowedScreens: ['home', 'fineLookup'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'VEHICLE_SELECT',
    phrases: ['chọn xe', 'đổi xe'],
    allowedScreens: ['fineLookup'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'FINE_VIEW_ALL',
    phrases: ['xem tất cả kết quả', 'xem lịch sử tra cứu'],
    allowedScreens: ['fineLookup'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'FINE_OPEN_DETAIL',
    phrases: ['xem chi tiết lỗi', 'mở chi tiết lỗi'],
    allowedScreens: ['fineLookup', 'fineResult'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'FINE_PAYMENT_GUIDE',
    phrases: ['hướng dẫn nộp phạt', 'cách nộp phạt'],
    allowedScreens: ['fineResult'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'FINE_SUBSCRIBE_OPEN',
    phrases: ['đăng ký nhận thông báo phạt nguội', 'bật thông báo phạt nguội'],
    allowedScreens: ['fineLookup'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'UTILITY_INSURANCE_OPEN',
    phrases: ['mở bảo hiểm xe', 'bảo hiểm xe', 'mua bảo hiểm xe'],
    allowedScreens: ['home', 'utilities', 'insurance'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'UTILITY_RESCUE_OPEN',
    phrases: ['mở cứu hộ', 'cứu hộ hai bốn bảy', 'gọi cứu hộ'],
    allowedScreens: ['utilities'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'UTILITY_GAS_OPEN',
    phrases: ['tìm trạm xăng', 'mở trạm xăng'],
    allowedScreens: ['utilities'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'UTILITY_REGISTRATION_OPEN',
    phrases: ['mở đăng kiểm', 'đăng kiểm'],
    allowedScreens: ['utilities'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'UTILITY_CAR_VALUATION_OPEN',
    phrases: ['định giá xe', 'mở định giá xe'],
    allowedScreens: ['utilities'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'INSURANCE_VIEW_TNDS',
    phrases: ['xem bảo hiểm trách nhiệm dân sự', 'bảo hiểm trách nhiệm dân sự'],
    allowedScreens: ['insurance'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'INSURANCE_VIEW_PHYSICAL',
    phrases: ['xem bảo hiểm vật chất', 'bảo hiểm vật chất'],
    allowedScreens: ['insurance'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'INSURANCE_BUY',
    phrases: ['mua bảo hiểm', 'bắt đầu mua bảo hiểm'],
    allowedScreens: ['insurance'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'COMMUNITY_ENTER_FIRST',
    phrases: ['vào kênh đầu tiên', 'mở nhóm đầu tiên'],
    allowedScreens: ['community'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'COMMUNITY_JOIN',
    phrases: ['tham gia nhóm này', 'tham gia cộng đồng'],
    allowedScreens: ['community'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'PROFILE_VEHICLE_MANAGE',
    phrases: ['mở quản lý phương tiện', 'quản lý phương tiện'],
    allowedScreens: ['profile'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'SETTINGS_DISPLAY_OPEN',
    phrases: [
      'mở thông báo và hiển thị',
      'cài đặt hiển thị',
      'vào cài đặt',
      'mở cài đặt',
      'cài đặt',
      'mở cài đặt thông báo',
      'cài đặt thông báo',
      'mở thông báo',
      'thông báo và hiển thị',
      'vào thông báo và hiển thị',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'SETTINGS_PERMISSION_OPEN',
    phrases: [
      'mở quyền truy cập',
      'quản lý quyền truy cập',
      'cài đặt quyền',
      'mở quyền',
      'quản lý quyền',
      'vào quyền truy cập',
    ],
    allowedScreens: 'all',
    dangerLevel: 'safe',
  },
  {
    intentCode: 'PERMISSION_LOCATION_ON',
    phrases: ['bật vị trí', 'cho phép vị trí'],
    allowedScreens: ['permissionSettings'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'PERMISSION_LOCATION_OFF',
    phrases: ['tắt vị trí'],
    allowedScreens: ['permissionSettings'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'PERMISSION_MIC_ON',
    phrases: ['bật micro', 'bật mic'],
    allowedScreens: ['permissionSettings'],
    dangerLevel: 'safe',
  },
  {
    intentCode: 'PERMISSION_MIC_OFF',
    phrases: ['tắt micro', 'tắt mic'],
    allowedScreens: ['permissionSettings'],
    dangerLevel: 'confirm',
  },
  {
    intentCode: 'CONFIRM_YES',
    phrases: [
      'đồng ý',
      'xác nhận',
      'đúng rồi',
      'ok',
      'okay',
      'okie',
      'oke',
      'có',
      'ừ',
      'ừa',
      'ừm',
      'ờ',
      'uhm',
      'um',
      'à ừ',
      'ờ ừ',
      'phải',
      'đúng',
      'đúng vậy',
      'được',
      'được rồi',
      'được đó',
      'chuẩn',
      'chuẩn rồi',
      'rồi',
      'ngon',
      'ngon rồi',
      'tốt',
      'tốt thôi',
      'làm đi',
      'làm luôn',
      'tiếp đi',
      'cứ làm',
      'cứ đi',
      'chắc chắn',
      'chắc rồi',
      'nhất định',
      'vâng',
      'dạ',
      'dạ được',
      'yes',
      'yeah',
      'yup',
      'go',
    ],
    allowedScreens: 'confirming',
    dangerLevel: 'safe',
    priority: 8,
  },
  {
    intentCode: 'CONFIRM_NO',
    phrases: [
      'không',
      'hủy',
      'bỏ qua',
      'thôi',
      'không đồng ý',
      'khỏi',
      'đừng',
      'thôi đi',
      'khoan',
      'để sau',
    ],
    allowedScreens: 'confirming',
    dangerLevel: 'safe',
    priority: 10,  // ✅ Tăng lên cao nhất để ưu tiên "không"
  },
];

const metaIntents = new Set([
  'ASSISTANT_WAKE',
  'ASSISTANT_CLOSE',
  'ASSISTANT_HELP',
  'CONFIRM_YES',
  'CONFIRM_NO',
  'NAV_BACK',
  'LIST_SCROLL_UP',
  'LIST_SCROLL_DOWN',
  'LIST_SELECT_1',
  'LIST_SELECT_2',
]);

export function getCommandHints(screen: ScreenId, confirming: boolean): string[] {
  if (confirming) {
    return ['Đồng ý', 'Hủy'];
  }

  const visible = commands.filter((command) => {
    if (command.allowedScreens === 'all') return true;
    if (command.allowedScreens === 'confirming') return false;
    return command.allowedScreens.includes(screen);
  });

  return visible.slice(0, 7).map((command) => command.phrases[0]);
}

export function getFallbackSuggestions(screen: ScreenId): string[] {
  const visible = commands.filter((command) => {
    if (metaIntents.has(command.intentCode)) return false;
    if (command.allowedScreens === 'all') return true;
    if (command.allowedScreens === 'confirming') return false;
    return command.allowedScreens.includes(screen);
  });
  return visible.map((command) => command.phrases[0]);
}

export function getCanonicalPhrase(intentCode: IntentCode): string | undefined {
  return commands.find((c) => c.intentCode === intentCode)?.phrases[0];
}

export function getLlmCandidates(
  screen: ScreenId,
  assistantState: 'idle' | 'assistantOpen' | 'listening' | 'recognizing' | 'matched' | 'confirming' | 'executing' | 'fallback' | 'cancelled',
): { intentCode: IntentCode; phrases: string[] }[] {
  const confirming = assistantState === 'confirming';
  return commands
    .filter((command) => {
      if (command.allowedScreens === 'all') return true;
      if (command.allowedScreens === 'confirming') return confirming;
      return command.allowedScreens.includes(screen);
    })
    .map((command) => ({
      intentCode: command.intentCode,
      phrases: command.phrases.slice(0, 6),
    }));
}
