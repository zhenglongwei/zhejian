/** H5/站外优先；小程序浏览类后置（B-TRACK-05） */
const TRACK_EVENT_NAMES = new Set([
  'h5_page_view',
  'h5_case_view',
  'h5_store_view',
  'h5_service_view',
  'h5_call_click',
  'h5_open_weapp_click',
  'h5_consult_click',
  'h5_share_click',
  'h5_scroll_depth',
  'h5_qrcode_show',
  'h5_store_service_click',
  'h5_store_case_click',
  'h5_store_consult_click',
  'h5_store_card_click',
  'h5_service_case_click',
  'h5_service_store_click',
  'h5_related_case_click',
  'h5_navigation_click',
  'phone_click',
  'lead_submit',
])

const TRACK_PARAM_BLOCKLIST = new Set([
  'phone',
  'mobile',
  'phoneNumber',
  'plate',
  'plateNo',
  'vin',
  'idCard',
  'realName',
  'address',
  'rawUrl',
  'imageUrl',
])

const TRACK_MAX_EVENTS_PER_REQUEST = 30
const TRACK_MAX_PARAM_KEYS = 32
const TRACK_MAX_STRING_LEN = 512

module.exports = {
  TRACK_EVENT_NAMES,
  TRACK_PARAM_BLOCKLIST,
  TRACK_MAX_EVENTS_PER_REQUEST,
  TRACK_MAX_PARAM_KEYS,
  TRACK_MAX_STRING_LEN,
}
