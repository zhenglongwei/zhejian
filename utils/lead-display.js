const {
  LEAD_STATUS,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_LABEL_MERCHANT,
  LEAD_STATUS_VARIANT,
  LEAD_STATUS_TONE,
} = require('../constants/lead-status')
const { LEAD_TAB_STATUS_MAP } = require('../constants/lead-list-tabs')
const { MERCHANT_LEAD_TAB_STATUS_MAP } = require('../constants/merchant-lead-tabs')
const { LEAD_CLOSE_REASON_LABEL } = require('../constants/lead-close-reason')
const { formatAppointmentLabel } = require('./lead-form')

function formatLeadDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function buildVehicleSummary(vehicle) {
  if (!vehicle) return ''
  return [vehicle.brand, vehicle.series].filter(Boolean).join(' ')
}

function resolveLeadServiceName(lead) {
  if (!lead) return '—'
  if (lead.serviceName) return lead.serviceName
  if (lead.leadType === 'message') return '门店留言'
  return '—'
}

function enrichLeadListItem(lead) {
  const status = lead.status || LEAD_STATUS.SUBMITTED
  const appointmentLabel = formatAppointmentLabel(lead.appointment)
  const description = lead.description || ''
  const vehicleSummary = buildVehicleSummary(lead.vehicle)
  return {
    ...lead,
    status,
    statusLabel: LEAD_STATUS_LABEL[status] || status,
    statusVariant: LEAD_STATUS_VARIANT[status] || 'default',
    statusTone: LEAD_STATUS_TONE[status] || 'warning',
    appointmentLabel,
    appointmentText: appointmentLabel || '—',
    descriptionPreview: description.length > 48 ? `${description.slice(0, 48)}…` : description,
    vehicleSummary,
    contactName: (lead.contact && lead.contact.name) || '',
    phoneDisplay: (lead.contact && lead.contact.phoneDisplay) || '',
    createdAtText: formatLeadDateTime(lead.createdAt),
  }
}

function filterLeadsByTab(list, tab) {
  const allowed = LEAD_TAB_STATUS_MAP[tab]
  if (!allowed) return list
  return list.filter((item) => allowed.includes(item.status))
}

function filterMerchantLeadsByTab(list, tab) {
  const allowed = MERCHANT_LEAD_TAB_STATUS_MAP[tab]
  if (!allowed) return list
  return list.filter((item) => allowed.includes(item.status))
}

function getMerchantLeadPrimaryAction(status) {
  if ([LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED].includes(status)) {
    return { actionKey: 'call', label: '联系用户' }
  }
  if (status === LEAD_STATUS.CONTACTED) {
    return { actionKey: 'view', label: '查看详情' }
  }
  return null
}

function enrichMerchantLeadListItem(lead) {
  const base = enrichLeadListItem(lead)
  const status = base.status
  return {
    ...base,
    displayServiceName: resolveLeadServiceName(lead),
    statusLabel: LEAD_STATUS_LABEL_MERCHANT[status] || base.statusLabel,
    primaryAction: getMerchantLeadPrimaryAction(status),
  }
}

function buildCloseReasonText(lead) {
  if (!lead || !lead.closeReason) return ''
  const label = LEAD_CLOSE_REASON_LABEL[lead.closeReason] || lead.closeReason
  if (lead.closeNote) return `${label}：${lead.closeNote}`
  return label
}

function buildLeadDetailRows(lead) {
  if (!lead) return []
  const rows = [
    { label: '咨询编号', value: lead.id },
    { label: '服务类型', value: lead.serviceName || '—' },
    { label: '门店', value: lead.storeName || '—' },
    { label: '联系人', value: lead.contact?.name || '—' },
    { label: '手机号', value: lead.contact?.phoneDisplay || '—' },
  ]
  const vehicle = lead.vehicle || {}
  if (vehicle.brand || vehicle.series) {
    rows.push({
      label: '车辆',
      value: [vehicle.brand, vehicle.series].filter(Boolean).join(' '),
    })
  }
  const apptLabel = formatAppointmentLabel(lead.appointment)
  if (apptLabel) {
    rows.push({ label: '期望到店', value: apptLabel })
  }
  return rows
}

function buildMerchantLeadDetailRows(lead) {
  if (!lead) return []
  const rows = [
    { label: '线索编号', value: lead.id },
    { label: '服务类型', value: resolveLeadServiceName(lead) },
    { label: '联系人', value: lead.contact?.name || '—' },
    { label: '联系电话', value: lead.contact?.phoneDisplay || '—' },
  ]
  const vehicle = lead.vehicle || {}
  if (vehicle.brand || vehicle.series) {
    rows.push({
      label: '车辆',
      value: [vehicle.brand, vehicle.series].filter(Boolean).join(' '),
    })
  }
  const apptLabel = formatAppointmentLabel(lead.appointment)
  if (apptLabel) {
    rows.push({ label: '期望到店', value: apptLabel })
  }
  const closeText = buildCloseReasonText(lead)
  if (closeText) {
    rows.push({ label: '关闭原因', value: closeText })
  }
  return rows
}

module.exports = {
  enrichLeadListItem,
  enrichMerchantLeadListItem,
  filterLeadsByTab,
  filterMerchantLeadsByTab,
  buildLeadDetailRows,
  buildMerchantLeadDetailRows,
  buildCloseReasonText,
  resolveLeadServiceName,
}
