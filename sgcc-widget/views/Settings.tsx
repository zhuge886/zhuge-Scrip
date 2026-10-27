import {
  Button,
  DisclosureGroup,
  HStack,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  SecureField,
  Section,
  Spacer,
  Stepper,
  Text,
  TextField,
  Toggle,
  VStack,
  Widget,
  useEffect,
  useRef,
  useState
} from 'scripting'
import { errorMessage, getData, sendSms } from '../api/client'
import type { DataResult } from '../api/client'
import { organizationsFor } from '../organizations'
import { normalize } from '../data'
import {
  clearCache,
  clearResolution,
  clearMetadata,
  clearQueryDiagnostic,
  getPassword,
  loadPreference,
  loadCache,
  loadMetadata,
  loadQueryDiagnostic,
  savePreference,
  setPassword
} from '../store'
import type { Dimension, Preference, QueryMode, QueryScope, QueryChannel } from '../store'
import { sourceKey, metadataKey, clearImportedFields } from '../accounts'
import { REGIONS, ELEC_TYPES } from '../regions'
import { amountDateLabel, visibleWarnings } from '../presentation'

const MIN_BARS = 3
const MAX_BARS = 14

/** A whole-number field that only commits positive values. */
function NumberField({
  title,
  value,
  onChanged
}: {
  title: string
  value: number
  onChanged: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  return (
    <HStack>
      <Text>{title}</Text>
      <Spacer />
      <TextField
        title={title}
        value={text}
        keyboardType="numberPad"
        multilineTextAlignment="trailing"
        frame={{ width: 100 }}
        onChanged={(next: string) => {
          setText(next)
          const n = Number(next)
          if (Number.isInteger(n) && n > 0) onChanged(n)
        }}
      />
    </HStack>
  )
}

/**
 * The whole app: the settings the Scriptable version kept in `withSettings`.
 * Preferences live in `Storage` (read by the widget), the password in the
 * Keychain; every change reloads the widgets.
 */
export function Settings() {
  const dismiss = Navigation.useDismiss()
  const [preference, setPreference] = useState<Preference>(() => loadPreference())
  const [password, setPasswordText] = useState(() => getPassword())
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [result, setResult] = useState<DataResult | null>(() => {
    const cached = loadCache()
    return cached?.sourceKey === sourceKey(loadPreference()) ? cached : null
  })
  const [advanced, setAdvanced] = useState(false)
  const [loginExpanded, setLoginExpanded] = useState(() => !preference.phone || !password)
  const [queryStatus, setQueryStatus] = useState('')
  const [diagnostic, setDiagnostic] = useState(() => loadQueryDiagnostic())
  const operation = useRef<{ cancelled: boolean } | null>(null)
  const companies = organizationsFor(preference.provinceCode)

  useEffect(() => {
    savePreference(preference)
    Widget.reloadAll()
  }, [preference])

  useEffect(() => {
    setPassword(password)
  }, [password])

  const update = (patch: Partial<Preference>) => {
    if (['phone', 'consNo', 'provinceCode'].some((key) => key in patch)) {
      const metadata = loadMetadata()
      patch = clearImportedFields(preference, patch, metadata?.key === metadataKey(preference) ? metadata.account : undefined)
      clearMetadata()
    }
    if ('provinceCode' in patch && patch.provinceCode !== preference.provinceCode) patch = { ...patch, orgNo: '' }
    if (['phone', 'queryMode', 'queryScope', 'queryChannel', 'consNo', 'provinceCode', 'orgNo', 'elecType']
      .some((key) => key in patch)) {
      if (operation.current) operation.current.cancelled = true
      clearCache()
      clearResolution()
      setResult(null)
      setQueryStatus('')
      clearQueryDiagnostic()
      setDiagnostic('')
    }
    setPreference((prev) => ({ ...prev, ...patch }))
  }

  const changePhone = (phone: string) => {
    // Data cached for another account must not show up under the new one.
    if (phone !== preference.phone) clearCache()
    update({ phone })
  }

  const onSendSms = async () => {
    setSending(true)
    try {
      savePreference(preference)
      setPassword(password)
      const masked = await sendSms()
      await Dialog.alert({
        title: '短信验证码已发送',
        message: `验证码已发至 ${masked}，请在 15 分钟内填入「短信验证码」后预览组件`
      })
    } catch (e) {
      console.error(e)
      await Dialog.alert({ title: '发送失败', message: errorMessage(e) })
    } finally {
      setSending(false)
    }
  }

  const onRefresh = async () => {
    const running = { cancelled: false }
    operation.current = running
    setRefreshing(true)
    setQueryStatus('准备查询…')
    clearQueryDiagnostic()
    setDiagnostic('')
    try {
      savePreference(preference)
      setPassword(password)
      const key = sourceKey(preference)
      const next = await getData({ force: true, discover: preference.queryMode === 'manual',
        shouldContinue: () => !running.cancelled,
        onProgress: (message) => { if (!running.cancelled && sourceKey(loadPreference()) === key) setQueryStatus(message) } })
      if (sourceKey(loadPreference()) !== key || running.cancelled) throw new Error('查询已停止或配置已改变，请按当前配置重新查询')
      setResult(next)
      setQueryStatus('余额已更新')
      const { error } = next
      const warnings = visibleWarnings(next.warnings)
      if (preference.smsCode) setPreference((value) => ({ ...value, smsCode: '' }))
      Widget.reloadAll()
      if (error || warnings.length) await Dialog.alert({
        title: error ? '刷新失败，已使用缓存' : '查询提示',
        message: error ?? warnings.join('\n')
      })
    } catch (e) {
      console.error(e)
      setQueryStatus(errorMessage(e))
      if (/短信|验证码|登录|密码/.test(errorMessage(e))) setLoginExpanded(true)
      await Dialog.alert({ title: '刷新失败', message: errorMessage(e) })
    } finally {
      if (!running.cancelled) setDiagnostic(loadQueryDiagnostic())
      operation.current = null
      setRefreshing(false)
    }
  }

  const onClearCache = async () => {
    clearCache()
    setResult(null)
    Widget.reloadAll()
    await Dialog.alert({ title: '已清除', message: '下次刷新将重新请求国网数据' })
  }

  const preview = async () => {
    try {
      await Widget.preview()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <NavigationStack>
      <List navigationTitle="网上国网" toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
        {result ? <Section header={<Text>当前余额</Text>}>
          {result.list.map((item, index) => {
            if (!item) return <Text key={index} foregroundStyle="systemOrange">{`第 ${index + 1} 户查询失败`}</Text>
            const data = normalize(item)
            const number = item.userInfo?.consNo_dst ?? item.userInfo?.consNo ?? ''
            return <VStack key={index} alignment="leading" spacing={8} padding={{ vertical: 8 }}>
              <HStack>
                <Text font="subheadline" foregroundStyle="secondaryLabel">{`户号末四位 ${number.slice(-4)}`}</Text>
                <Spacer />
                <Text font="caption" foregroundStyle={result.error ? 'systemOrange' : 'secondaryLabel'}>
                  {result.error ? '缓存数据' : '最近查询'}
                </Text>
              </HStack>
              <Text font="subheadline" foregroundStyle="secondaryLabel">{data.balanceLabel}</Text>
              <HStack alignment="firstTextBaseline" spacing={6}>
                <Text font={36} fontWeight="bold" fontDesign="rounded" lineLimit={1} minScaleFactor={0.5}>{data.balance}</Text>
                <Text font="subheadline" foregroundStyle="secondaryLabel">元</Text>
              </HStack>
              <Text font="caption" foregroundStyle="secondaryLabel">{amountDateLabel(data.amountAsOf, result.fetchedAt)}</Text>
              {data.amountDue != null ? <Text font="caption" foregroundStyle="secondaryLabel">{`本期应缴 ${data.amountDue} 元`}</Text> : null}
            </VStack>
          })}
          {result.error ? <Text foregroundStyle="systemOrange">{result.error}</Text> : null}
          {visibleWarnings(result.warnings).map((message, index) => <Text key={index} foregroundStyle="systemOrange">{message}</Text>)}
        </Section> : null}

        <Section header={<Text>用电户号</Text>} footer={<Text>保留户号开头的 0。</Text>}>
          {preference.queryMode === 'manual' ? [
            <TextField key="household" title="用电户号" prompt="完整户号" value={preference.consNo}
              keyboardType="numberPad" onChanged={(consNo: string) => update({ consNo })} />,
            <Picker key="region" title="所在地区" value={preference.provinceCode}
              onChanged={(provinceCode: string) => update({ provinceCode })}>
              <Text tag="">请选择地区</Text>
              {REGIONS.map((region) => <Text key={region.code} tag={region.code}>{region.name}</Text>)}
              {preference.provinceCode && !REGIONS.some((region) => region.code === preference.provinceCode)
                ? <Text tag={preference.provinceCode}>{`自定义地区 ${preference.provinceCode}`}</Text> : null}
            </Picker>
          ] : <Text foregroundStyle="secondaryLabel">使用当前账号已绑定的户号</Text>}
        </Section>

        <Section>
          <Button action={onRefresh} disabled={refreshing || sending}>
            <HStack>
              <Text>{refreshing ? '正在查询…' : '刷新余额'}</Text>
              <Spacer />
              {refreshing ? <ProgressView /> : null}
            </HStack>
          </Button>
          {refreshing ? <Button title="停止查询" action={() => { if (operation.current) operation.current.cancelled = true; setQueryStatus('正在停止…') }} /> : null}
          {queryStatus && (refreshing || !result) ? <Text foregroundStyle="secondaryLabel">{queryStatus}</Text> : null}
          <Button title="预览小组件" action={preview} />
        </Section>

        <Section footer={<Text>使用本人的网上国网账号登录。</Text>}>
          <DisclosureGroup isExpanded={loginExpanded} onChanged={setLoginExpanded}
            label={<HStack><Text>登录账号</Text><Spacer />
              {preference.phone ? <Text foregroundStyle="secondaryLabel">{`${preference.phone.slice(0, 3)}****${preference.phone.slice(-4)}`}</Text> : null}
            </HStack>}>
            <TextField title="手机号" prompt="手机号" value={preference.phone}
              keyboardType="phonePad" onChanged={changePhone} />
            <SecureField title="密码" prompt="密码" value={password}
              onChanged={(value: string) => { if (operation.current) operation.current.cancelled = true; setResult(null); setPasswordText(value) }} />
            <Button title={sending ? '正在发送…' : '发送短信验证码'} action={onSendSms} disabled={sending || refreshing} />
            <TextField title="短信验证码" prompt="新设备登录需要时填写" value={preference.smsCode}
              keyboardType="numberPad" onChanged={(smsCode: string) => update({ smsCode })} />
          </DisclosureGroup>
        </Section>

        <Section>
          <DisclosureGroup title="更多设置" isExpanded={advanced} onChanged={setAdvanced}>
            <Picker title="户号来源" value={preference.queryMode}
              onChanged={(value: string) => update({ queryMode: value as QueryMode })}>
              <Text tag="manual">手动户号</Text><Text tag="bound">账号绑定户号</Text>
            </Picker>
            {preference.queryMode === 'manual' ? <Picker title="查询入口" value={preference.queryChannel}
              onChanged={(queryChannel: string) => update({ queryChannel: queryChannel as QueryChannel })}>
              <Text tag="auto">自动（推荐）</Text><Text tag="payment">其他户号交费</Text><Text tag="balance">原余额入口（兼容）</Text>
            </Picker> : null}
            {preference.queryMode === 'bound' || preference.queryChannel === 'balance' ? <Picker title="查询内容" value={preference.queryScope}
              onChanged={(value: string) => update({ queryScope: value as QueryScope })}>
              <Text tag="balance">仅余额</Text><Text tag="full">余额与用电明细</Text>
            </Picker> : null}
            {preference.queryMode === 'manual' && preference.queryChannel === 'balance' ? [
              <Picker key="company" title="供电公司" value={preference.orgNo} onChanged={(orgNo: string) => update({ orgNo })}>
                <Text tag="">自动尝试已收录公司</Text>
                {companies.map((company) => <Text key={company.code} tag={company.code}>{company.name}</Text>)}
                {preference.orgNo && !companies.some((company) => company.code === preference.orgNo)
                  ? <Text tag={preference.orgNo}>{`自定义单位 ${preference.orgNo}`}</Text> : null}
              </Picker>,
              <Picker key="type" title="用电类型" value={preference.elecType} onChanged={(elecType: string) => update({ elecType })}>
                <Text tag="">自动尝试</Text>
                {ELEC_TYPES.map((type) => <Text key={type.code} tag={type.code}>{type.name}</Text>)}
              </Picker>,
              <TextField key="org" title="供电单位代码（选填）" value={preference.orgNo}
                keyboardType="numberPad" onChanged={(orgNo: string) => update({ orgNo })} />,
              <TextField key="province" title="自定义地区代码（选填）" value={preference.provinceCode}
                keyboardType="numberPad" onChanged={(provinceCode: string) => update({ provinceCode })} />
            ] : null}
            {preference.queryMode === 'bound' || preference.queryChannel === 'balance' ? <DisclosureGroup title="用电明细样式">
              <Picker title="柱状图" value={preference.dimension} onChanged={(value: string) => update({ dimension: value as Dimension })} pickerStyle="segmented">
                <Text tag="daily">每日</Text><Text tag="monthly">每月</Text>
              </Picker>
              <Stepper onIncrement={() => update({ barCount: Math.min(MAX_BARS, preference.barCount + 1) })}
                onDecrement={() => update({ barCount: Math.max(MIN_BARS, preference.barCount - 1) })}>
                <HStack><Text>柱状图数量</Text><Spacer /><Text foregroundStyle="secondaryLabel">{preference.barCount}</Text></HStack>
              </Stepper>
              <Toggle title="显示阶梯进度" value={preference.showStepProgress} onChanged={(showStepProgress: boolean) => update({ showStepProgress })} />
              <NumberField title="第一阶梯上限" value={preference.oneLevelPq} onChanged={(oneLevelPq) => update({ oneLevelPq })} />
              <NumberField title="第二阶梯上限" value={preference.twoLevelPq} onChanged={(twoLevelPq) => update({ twoLevelPq })} />
            </DisclosureGroup> : null}
            {result?.queryInfo ? <Text font="caption" foregroundStyle="secondaryLabel">{result.queryInfo}</Text> : null}
            {diagnostic ? <Button title="复制查询诊断" action={async () => {
              await Pasteboard.setString(diagnostic)
              await Dialog.alert({ title: '诊断已复制', message: '仅包含状态码、字段类型和核对结果，不含账号凭证。' })
            }} /> : null}
            <Button title="清除数据缓存" role="destructive" action={onClearCache} />
          </DisclosureGroup>
        </Section>
      </List>
    </NavigationStack>
  )
}
