import {
  Button,
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
  getPassword,
  loadPreference,
  loadMetadata,
  savePreference,
  setPassword
} from '../store'
import type { Dimension, Preference, QueryMode, QueryScope, QueryChannel } from '../store'
import { sourceKey, metadataKey, clearImportedFields } from '../accounts'
import { REGIONS, ELEC_TYPES } from '../regions'

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
  const [result, setResult] = useState<DataResult | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [queryStatus, setQueryStatus] = useState('')
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
    try {
      savePreference(preference)
      setPassword(password)
      const key = sourceKey(preference)
      const next = await getData({ force: true, discover: preference.queryMode === 'manual',
        shouldContinue: () => !running.cancelled,
        onProgress: (message) => { if (!running.cancelled && sourceKey(loadPreference()) === key) setQueryStatus(message) } })
      if (sourceKey(loadPreference()) !== key || running.cancelled) throw new Error('查询已停止或配置已改变，请按当前配置重新查询')
      setResult(next)
      setQueryStatus(next.queryInfo ?? '查询完成')
      const { list, error, warnings } = next
      const ok = list.filter(Boolean).length
      await Dialog.alert({
        title: error ? '刷新失败，已使用缓存' : warnings.length ? '已获取部分数据' : '刷新成功',
        message: error ?? (warnings.length ? warnings.join('\n') : `已获取 ${ok} 个户号的数据`)
      })
      Widget.reloadAll()
    } catch (e) {
      console.error(e)
      setQueryStatus(errorMessage(e))
      await Dialog.alert({ title: '刷新失败', message: errorMessage(e) })
    } finally {
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
      <List
        navigationTitle="网上国网"
        toolbar={{
          cancellationAction: <Button title="完成" action={dismiss} />
        }}
      >
        <Section
          header={<Text>查询方式</Text>}
          footer={<Text>自动模式：未绑定户号走其他户号交费查询；已绑定户号保留余额与明细查询。仍需登录本人的网上国网账号。</Text>}
        >
          <Picker title="户号来源" value={preference.queryMode}
            onChanged={(value: string) => update({ queryMode: value as QueryMode })}>
            <Text tag="manual">手动户号</Text>
            <Text tag="bound">账号绑定户号</Text>
          </Picker>
          <Picker title="查询内容" value={preference.queryScope}
            onChanged={(value: string) => update({ queryScope: value as QueryScope })}>
            <Text tag="balance">余额 / 待缴金额</Text>
            <Text tag="full">余额与用电明细</Text>
          </Picker>
        </Section>

        {preference.queryMode === 'manual' ? (
          <Section
            header={<Text>手动户号</Text>}
            footer={<Text>保留户号开头的 0。交费查询只需户号和地区，无需供电公司代码。余额、表内余额和应缴金额会按返回类型分别标注；可能要求在 App 完成验证。</Text>}
          >
            <TextField title="用电户号" prompt="完整户号" value={preference.consNo}
              keyboardType="numberPad" onChanged={(consNo: string) => update({ consNo })} />
            <Picker title="所在地区" value={preference.provinceCode}
              onChanged={(provinceCode: string) => update({ provinceCode })}>
              <Text tag="">请选择地区</Text>
              {REGIONS.map((region) => <Text key={region.code} tag={region.code}>{region.name}</Text>)}
              {preference.provinceCode && !REGIONS.some((region) => region.code === preference.provinceCode)
                ? <Text tag={preference.provinceCode}>{`自定义地区 ${preference.provinceCode}`}</Text> : null}
            </Picker>
            <Picker title="查询入口" value={preference.queryChannel}
              onChanged={(queryChannel: string) => update({ queryChannel: queryChannel as QueryChannel })}>
              <Text tag="auto">自动（推荐）</Text>
              <Text tag="payment">其他户号交费</Text>
              <Text tag="balance">原余额接口（兼容）</Text>
            </Picker>
            {preference.queryChannel === 'balance' ? [
            <Picker key="company" title="供电公司" value={preference.orgNo}
              onChanged={(orgNo: string) => update({ orgNo })}>
              <Text tag="">自动尝试已收录公司</Text>
              {companies.map((company) => <Text key={company.code} tag={company.code}>{company.name}</Text>)}
              {preference.orgNo && !companies.some((company) => company.code === preference.orgNo)
                ? <Text tag={preference.orgNo}>{`自定义单位 ${preference.orgNo}`}</Text> : null}
            </Picker>,
            !companies.length ? <Text foregroundStyle="secondaryLabel">该地区暂未收录单位目录；可使用账号已有的同地区资料或在高级设置填写真实单位代码。</Text> : null,
            <Picker key="scene" title="用电类型" value={preference.elecType}
              onChanged={(elecType: string) => update({ elecType })}>
              <Text tag="">自动尝试（推荐）</Text>
              {ELEC_TYPES.map((type) => <Text key={type.code} tag={type.code}>{type.name}</Text>)}
              {preference.elecType && !ELEC_TYPES.some((type) => type.code === preference.elecType)
                ? <Text tag={preference.elecType}>{`自定义类型 ${preference.elecType}`}</Text> : null}
            </Picker>
            ] : null}
            {preference.queryChannel === 'balance' ? <Toggle title="高级设置（选填）" value={advanced} onChanged={setAdvanced} /> : null}
          </Section>
        ) : null}

        {preference.queryMode === 'manual' && preference.queryChannel === 'balance' && advanced ? (
          <Section header={<Text>可选查询资料</Text>}
            footer={<Text>选公司会使用其真实目录代码。自定义代码优先于自动尝试；不要填写缴费商户编号或工商代码。</Text>}>
            <TextField title="供电单位代码（选填）" prompt="可留空" value={preference.orgNo}
              keyboardType="numberPad" onChanged={(orgNo: string) => update({ orgNo })} />
            <TextField title="自定义地区代码（选填）" prompt="通常用上面的地区选择即可" value={preference.provinceCode}
              keyboardType="numberPad" onChanged={(provinceCode: string) => update({ provinceCode })} />
            <Button title="清除已保存的可用组合" action={() => { clearResolution(); clearCache(); setResult(null); setQueryStatus('已清除，下次点击查询时重新尝试'); Widget.reloadAll() }} />
          </Section>
        ) : null}

        <Section
          header={<Text>网上国网账号</Text>}
          footer={
            <Text>填写你自己的网上国网登录账号，用于取得请求凭证。手机号不用于选择查询户号。首次新设备登录可能需要短信验证。</Text>
          }
        >
          <TextField
            title="手机号"
            prompt="手机号"
            value={preference.phone}
            keyboardType="phonePad"
            onChanged={changePhone}
          />
          <SecureField
            title="密码"
            prompt="密码"
            value={password}
            onChanged={(value: string) => { if (operation.current) operation.current.cancelled = true; setResult(null); setPasswordText(value) }}
          />
          <Button action={onSendSms} disabled={sending || refreshing}>
            <HStack>
              <Text>发送短信验证码</Text>
              <Spacer />
              {sending ? <ProgressView /> : null}
            </HStack>
          </Button>
          <TextField
            title="短信验证码"
            prompt="短信验证码"
            value={preference.smsCode}
            keyboardType="numberPad"
            onChanged={(smsCode: string) => update({ smsCode })}
          />
        </Section>

        {result ? (
          <Section header={<Text>查询结果</Text>}>
            {result.queryInfo ? <Text>{result.queryInfo}</Text> : null}
            <Text>{`${result.error ? '缓存数据 · ' : ''}${new Date(result.fetchedAt).toLocaleString()}`}</Text>
            {result.list.map((item, index) => {
              if (!item) return <Text key={index}>{`第 ${index + 1} 户查询失败`}</Text>
              const data = normalize(item)
              const label = item.userInfo?.consNo_dst ?? item.userInfo?.consNo ?? ''
              return <Text key={index}>{`户号末四位 ${label.slice(-4)} · ${data.balanceLabel} ${data.balance} 元${data.amountDue != null ? ` · 本期应缴 ${data.amountDue} 元` : ''}`}</Text>
            })}
            {result.error ? <Text foregroundStyle="systemOrange">{result.error}</Text> : null}
            {result.warnings.map((message, index) => <Text key={`warning-${index}`} foregroundStyle="systemOrange">{message}</Text>)}
          </Section>
        ) : null}

        <Section header={<Text>数据</Text>}>
          <Button action={onRefresh} disabled={refreshing || sending}>
            <HStack>
              <Text>{preference.queryMode === 'manual' ? '查询金额' : '立即刷新'}</Text>
              <Spacer />
              {refreshing ? <ProgressView /> : null}
            </HStack>
          </Button>
          {refreshing ? <Button title="停止查询" action={() => { if (operation.current) operation.current.cancelled = true; setQueryStatus('正在停止，等待当前请求结束…') }} /> : null}
          {queryStatus ? <Text foregroundStyle="secondaryLabel">{queryStatus}</Text> : null}
          <Button title="清除数据缓存" role="destructive" action={onClearCache} />
        </Section>

        <Section header={<Text>显示</Text>}>
          <Picker
            title="柱状图"
            value={preference.dimension}
            onChanged={(value: string) => update({ dimension: value as Dimension })}
            pickerStyle="segmented"
          >
            <Text tag="daily">每日</Text>
            <Text tag="monthly">每月</Text>
          </Picker>
          <Stepper
            onIncrement={() =>
              update({ barCount: Math.min(MAX_BARS, preference.barCount + 1) })
            }
            onDecrement={() =>
              update({ barCount: Math.max(MIN_BARS, preference.barCount - 1) })
            }
          >
            <HStack>
              <Text>柱状图数量</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">{preference.barCount}</Text>
            </HStack>
          </Stepper>
          <Toggle
            title="显示阶梯进度"
            value={preference.showStepProgress}
            onChanged={(showStepProgress: boolean) => update({ showStepProgress })}
          />
          <NumberField
            title="第一阶梯上限"
            value={preference.oneLevelPq}
            onChanged={(oneLevelPq) => update({ oneLevelPq })}
          />
          <NumberField
            title="第二阶梯上限"
            value={preference.twoLevelPq}
            onChanged={(twoLevelPq) => update({ twoLevelPq })}
          />
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={
            <Text>手动模式留空参数即可。绑定模式可填完整户号，也可填从 0 开始的序号。参数只能选择已查询的数据，不会切换到其他未配置户号。</Text>
          }
        >
          <Button title="预览小组件" action={preview} />
        </Section>
      </List>
    </NavigationStack>
  )
}

