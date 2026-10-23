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
  useState
} from 'scripting'
import { errorMessage, getData, sendSms } from '../api/client'
import type { DataResult } from '../api/client'
import { normalize } from '../data'
import {
  clearCache,
  getPassword,
  loadPreference,
  savePreference,
  setPassword
} from '../store'
import type { Dimension, Preference, QueryMode, QueryScope } from '../store'

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

  useEffect(() => {
    savePreference(preference)
    Widget.reloadAll()
  }, [preference])

  useEffect(() => {
    setPassword(password)
  }, [password])

  const update = (patch: Partial<Preference>) => {
    if (['phone', 'queryMode', 'queryScope', 'consNo', 'provinceCode', 'orgNo', 'elecType']
      .some((key) => key in patch)) {
      clearCache()
      setResult(null)
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
    setRefreshing(true)
    try {
      savePreference(preference)
      setPassword(password)
      const next = await getData({ force: true })
      setResult(next)
      const { list, error, warnings } = next
      const ok = list.filter(Boolean).length
      await Dialog.alert({
        title: error ? '刷新失败，已使用缓存' : warnings.length ? '已获取部分数据' : '刷新成功',
        message: error ?? (warnings.length ? warnings.join('\n') : `已获取 ${ok} 个户号的数据`)
      })
      Widget.reloadAll()
    } catch (e) {
      console.error(e)
      await Dialog.alert({ title: '刷新失败', message: errorMessage(e) })
    } finally {
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
          footer={<Text>手动模式使用你填写的户号，不要求它出现在手机号的绑定列表。仍需登录；未绑定户号直查为待验证功能，不等同于 App 的「为其他户号交费」。</Text>}
        >
          <Picker title="户号来源" value={preference.queryMode}
            onChanged={(value: string) => update({ queryMode: value as QueryMode })}>
            <Text tag="manual">手动户号（待验证）</Text>
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
            footer={<Text>保留户号开头的 0。若未绑定，下面三项需来自实际查询资料：省份 proNo/provinceId、供电单位 orgNo、类型 elecType/constType。当前还不能自动补全，不能仅填户号查询。无需提供房东密码。</Text>}
          >
            <TextField title="用电户号" prompt="完整户号" value={preference.consNo}
              keyboardType="numberPad" onChanged={(consNo: string) => update({ consNo })} />
            <TextField title="省份代码" prompt="原查询返回的省份代码" value={preference.provinceCode}
              keyboardType="numberPad" onChanged={(provinceCode: string) => update({ provinceCode })} />
            <TextField title="供电单位代码" prompt="orgNo" value={preference.orgNo}
              keyboardType="numberPad" onChanged={(orgNo: string) => update({ orgNo })} />
            <TextField title="用电类型代码" prompt="elecType / constType" value={preference.elecType}
              keyboardType="numberPad" onChanged={(elecType: string) => update({ elecType })} />
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
            onChanged={(value: string) => { setResult(null); setPasswordText(value) }}
          />
          <Button action={onSendSms} disabled={sending}>
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
            <Text>{`${result.error ? '缓存数据 · ' : ''}${new Date(result.fetchedAt).toLocaleString()}`}</Text>
            {result.list.map((item, index) => {
              if (!item) return <Text key={index}>{`第 ${index + 1} 户查询失败`}</Text>
              const data = normalize(item)
              const label = item.userInfo?.consNo_dst ?? item.userInfo?.consNo ?? ''
              return <Text key={index}>{`户号末四位 ${label.slice(-4)} · ${data.arrearsOfFees ? '待缴' : '余额'} ${data.balance} 元${data.amountDue != null ? ` · 本期应缴 ${data.amountDue} 元` : ''}`}</Text>
            })}
            {result.error ? <Text foregroundStyle="systemOrange">{result.error}</Text> : null}
            {result.warnings.map((message, index) => <Text key={`warning-${index}`} foregroundStyle="systemOrange">{message}</Text>)}
          </Section>
        ) : null}

        <Section header={<Text>数据</Text>}>
          <Button action={onRefresh} disabled={refreshing}>
            <HStack>
              <Text>立即刷新</Text>
              <Spacer />
              {refreshing ? <ProgressView /> : null}
            </HStack>
          </Button>
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

