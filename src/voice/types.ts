export type ScreenId =
  | 'home'
  | 'radio'
  | 'radioOnAir'
  | 'utilities'
  | 'community'
  | 'profile'
  | 'notifications'
  | 'route'
  | 'fineLookup'
  | 'fineResult'
  | 'insurance'
  | 'displaySettings'
  | 'permissionSettings';

export type DangerLevel = 'safe' | 'confirm' | 'blockedWhileDriving';

export type IntentCode =
  | 'ASSISTANT_WAKE'
  | 'ASSISTANT_CLOSE'
  | 'ASSISTANT_HELP'
  | 'NAV_HOME'
  | 'NAV_RADIO'
  | 'NAV_UTILITIES'
  | 'NAV_COMMUNITY'
  | 'NAV_PROFILE'
  | 'NAV_NOTIFICATIONS'
  | 'NAV_BACK'
  | 'LIST_SCROLL_DOWN'
  | 'LIST_SCROLL_UP'
  | 'LIST_SELECT_1'
  | 'LIST_SELECT_2'
  | 'ROUTE_OPEN'
  | 'ROUTE_SET_HN_LS'
  | 'ROUTE_EDIT_ORIGIN'
  | 'ROUTE_EDIT_DESTINATION'
  | 'ROUTE_CLEAR'
  | 'DRIVE_READ_ALERTS'
  | 'DRIVE_REPEAT_ALERT'
  | 'SETTING_HOTSPOT_ALERT_ON'
  | 'VIOLATION_ALERT_ON'
  | 'VIOLATION_ALERT_OFF'
  | 'REPORT_OPEN'
  | 'REPORT_TRAFFIC_JAM'
  | 'REPORT_ACCIDENT'
  | 'REPORT_OBSTACLE'
  | 'REPORT_SUBMIT'
  | 'RADIO_PLAY'
  | 'RADIO_PAUSE'
  | 'MEDIA_NEXT'
  | 'MEDIA_PREV'
  | 'RADIO_CHANNEL_NEXT'
  | 'RADIO_CHANNEL_PREV'
  | 'RADIO_TALK_OPEN'
  | 'RADIO_PLAY_BY_NAME'
  | 'RADIO_LIST_CHANNELS'
  | 'RADIO_MIC_MUTE'
  | 'RADIO_MIC_UNMUTE'
  | 'RADIO_SPEAKER_ON'
  | 'RADIO_LEAVE_ROOM'
  | 'CONTENT_PLAY_ROAD_STORY'
  | 'CONTENT_PLAY_FRIENDS'
  | 'FINE_OPEN'
  | 'FINE_CHECK_NOW'
  | 'VEHICLE_SELECT'
  | 'FINE_VIEW_ALL'
  | 'FINE_OPEN_DETAIL'
  | 'FINE_PAYMENT_GUIDE'
  | 'FINE_SUBSCRIBE_OPEN'
  | 'UTILITY_INSURANCE_OPEN'
  | 'UTILITY_RESCUE_OPEN'
  | 'UTILITY_GAS_OPEN'
  | 'UTILITY_REGISTRATION_OPEN'
  | 'UTILITY_CAR_VALUATION_OPEN'
  | 'INSURANCE_VIEW_TNDS'
  | 'INSURANCE_VIEW_PHYSICAL'
  | 'INSURANCE_BUY'
  | 'COMMUNITY_ENTER_FIRST'
  | 'COMMUNITY_JOIN'
  | 'PROFILE_VEHICLE_MANAGE'
  | 'SETTINGS_DISPLAY_OPEN'
  | 'SETTINGS_PERMISSION_OPEN'
  | 'PERMISSION_LOCATION_ON'
  | 'PERMISSION_LOCATION_OFF'
  | 'PERMISSION_MIC_ON'
  | 'PERMISSION_MIC_OFF'
  | 'CONFIRM_YES'
  | 'CONFIRM_NO';

export type AssistantState =
  | 'idle'
  | 'assistantOpen'
  | 'listening'
  | 'recognizing'
  | 'matched'
  | 'confirming'
  | 'executing'
  | 'fallback'
  | 'cancelled';

export type CommandDefinition = {
  intentCode: IntentCode;
  phrases: string[];
  allowedScreens: ScreenId[] | 'all' | 'confirming';
  dangerLevel: DangerLevel;
  priority?: number;
  fallbackHint?: string;
};

export type ActionCode =
  | 'OPEN_ASSISTANT'
  | 'CLOSE_ASSISTANT'
  | 'SHOW_HELP'
  | 'OPEN_HOME_SCREEN'
  | 'OPEN_RADIO_SCREEN'
  | 'OPEN_UTILITIES_SCREEN'
  | 'OPEN_COMMUNITY_SCREEN'
  | 'OPEN_PROFILE_SCREEN'
  | 'OPEN_NOTIFICATIONS_SCREEN'
  | 'GO_BACK'
  | 'SCROLL_DOWN'
  | 'SCROLL_UP'
  | 'SELECT_FIRST_ITEM'
  | 'SELECT_SECOND_ITEM'
  | 'OPEN_ROUTE_SCREEN'
  | 'SET_ROUTE_HN_LS'
  | 'EDIT_ROUTE_ORIGIN'
  | 'EDIT_ROUTE_DESTINATION'
  | 'CLEAR_ROUTE'
  | 'READ_DRIVE_ALERTS'
  | 'REPEAT_DRIVE_ALERT'
  | 'ENABLE_HOTSPOT_ALERT'
  | 'ENABLE_VIOLATION_ALERTS'
  | 'DISABLE_VIOLATION_ALERTS'
  | 'OPEN_REPORT_DRAFT'
  | 'DRAFT_TRAFFIC_JAM_REPORT'
  | 'DRAFT_ACCIDENT_REPORT'
  | 'DRAFT_OBSTACLE_REPORT'
  | 'SUBMIT_REPORT'
  | 'PLAY_RADIO'
  | 'PLAY_RADIO_BY_NAME'
  | 'PAUSE_RADIO'
  | 'LIST_RADIO_CHANNELS'
  | 'PLAY_NEXT_CONTENT'
  | 'PLAY_PREVIOUS_CONTENT'
  | 'SWITCH_NEXT_CHANNEL'
  | 'SWITCH_PREV_CHANNEL'
  | 'SCROLL_NEXT_VIOLATION'
  | 'OPEN_RADIO_TALK'
  | 'MUTE_MIC'
  | 'UNMUTE_MIC'
  | 'ENABLE_SPEAKER'
  | 'LEAVE_RADIO_ROOM'
  | 'PLAY_ROAD_STORY'
  | 'PLAY_FRIENDS_CONTENT'
  | 'OPEN_FINE_LOOKUP'
  | 'OPEN_FINE_LOOKUP_WITH_DEFAULT_VEHICLE'
  | 'RUN_FINE_LOOKUP'
  | 'OPEN_VEHICLE_SELECTOR'
  | 'OPEN_FINE_RESULT_LIST'
  | 'OPEN_FINE_DETAIL'
  | 'OPEN_FINE_PAYMENT_GUIDE'
  | 'OPEN_FINE_SUBSCRIBE'
  | 'OPEN_INSURANCE_SCREEN'
  | 'OPEN_RESCUE_SERVICE'
  | 'OPEN_GAS_SERVICE'
  | 'OPEN_REGISTRATION_SERVICE'
  | 'OPEN_CAR_VALUATION'
  | 'FOCUS_INSURANCE_TNDS'
  | 'FOCUS_INSURANCE_PHYSICAL'
  | 'START_INSURANCE_BUY'
  | 'ENTER_FIRST_COMMUNITY'
  | 'JOIN_COMMUNITY'
  | 'OPEN_VEHICLE_MANAGEMENT'
  | 'OPEN_DISPLAY_SETTINGS'
  | 'OPEN_PERMISSION_SETTINGS'
  | 'ENABLE_LOCATION_PERMISSION'
  | 'DISABLE_LOCATION_PERMISSION'
  | 'ENABLE_MIC_PERMISSION'
  | 'DISABLE_MIC_PERMISSION'
  | 'CONFIRM_PENDING'
  | 'CANCEL_PENDING';

export type FeedbackContext = {
  plate?: string;
  routeOrigin?: string;
  routeDest?: string;
  channelName?: string;
  availableChannels?: string;
  topicName?: string;
  alertCount?: number;
  fineCount?: number;
  fineCountText?: string;
  notificationCount?: number;
  nearestGasDistance?: string;
};

export type ScreenAction = {
  intentCode: IntentCode;
  screen: ScreenId | 'all' | 'confirming';
  actionCode: ActionCode;
  nextScreen?: ScreenId;
  feedback: string | string[];
  requiresConfirmation?: boolean;
  confirmPrompt?: string | string[];
  confirmPromptByScreen?: Partial<Record<ScreenId, string | string[]>>;
  riskLevel?: 'safe' | 'caution' | 'critical';
};

export type CommandCandidate = {
  command: CommandDefinition;
  confidence: number;
  phrase: string;
};

export type MatchResult =
  | { type: 'matched'; candidate: CommandCandidate }
  | { type: 'ambiguous'; candidates: CommandCandidate[] }
  | { type: 'noMatch' };

export type TranscriptEntry = {
  id: number;
  speaker: 'user' | 'bot' | 'system';
  text: string;
};

export type PendingConfirmation = {
  action: ScreenAction;
  createdFrom: string;
};

export type IntentActionKind = 'exec' | 'info_readback' | 'visual_required';

export type LlmIntentResult = {
  intentCode: string | null;
  confidence: number;
  reason?: string;
  latencyMs?: number;
  cacheHit?: boolean;
};

export type LlmCandidatePayload = {
  intentCode: IntentCode;
  phrases: string[];
};

export type LlmRecentAction = {
  actionCode: ActionCode;
  msAgo: number;
};
