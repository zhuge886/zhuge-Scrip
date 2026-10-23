/**
 * Public State Grid website dictionaries, inspected 2026-10-23.
 * See API.md for the source files and the distinction between province routing
 * codes, electricity scenes and prepaid/postpaid billing modes.
 */
export const REGIONS = [
  { code: '11102', name: '北京' }, { code: '12101', name: '天津' },
  { code: '13102', name: '河北（国网河北）' }, { code: '16101', name: '河北（国网冀北）' },
  { code: '14101', name: '山西' }, { code: '15101', name: '内蒙古（国网）' },
  { code: '21102', name: '辽宁' }, { code: '22101', name: '吉林' },
  { code: '23101', name: '黑龙江' }, { code: '31102', name: '上海' },
  { code: '32101', name: '江苏' }, { code: '33101', name: '浙江' },
  { code: '34101', name: '安徽' }, { code: '35101', name: '福建' },
  { code: '36101', name: '江西' }, { code: '37101', name: '山东' },
  { code: '41101', name: '河南' }, { code: '42102', name: '湖北' },
  { code: '43101', name: '湖南' }, { code: '50101', name: '重庆' },
  { code: '51101', name: '四川' }, { code: '54101', name: '西藏' },
  { code: '61102', name: '陕西' }, { code: '62101', name: '甘肃' },
  { code: '63101', name: '青海' }, { code: '64101', name: '宁夏' },
  { code: '65101', name: '新疆' }
] as const

export const ELEC_TYPES = [
  { code: '01', name: '住宅' }, { code: '02', name: '店铺' },
  { code: '03', name: '电动车' }, { code: '04', name: '企事业' },
  { code: '05', name: '新能源' }
] as const

export function typeName(code: string): string {
  return ELEC_TYPES.find((item) => item.code === code)?.name ?? (code ? `类型 ${code}` : '自动')
}

export function regionName(code: string): string {
  return REGIONS.find((item) => item.code === code)?.name ?? (code ? `自定义地区 ${code}` : '未选择地区')
}
