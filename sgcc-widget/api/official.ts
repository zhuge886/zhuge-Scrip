import type { PowerAccount } from '../accounts'
import { metadataKey, sourceKey } from '../accounts'
import type { Preference } from '../store'
import { clearCache, clearResolution, loadPreference, saveMetadata, savePreference } from '../store'

const OFFICIAL_URL = 'https://www.95598.cn/osgweb/'
export type OfficialResult = {
  pending?: boolean
  ok?: boolean
  code?: string
  message?: string
  account?: PowerAccount
}

/** Runs inside the official website. Only the two inspected read endpoints are used. */
export function buildOfficialLookupScript(consNo: string, provinceCode: string, observe = false): string {
  if (!/^\d+$/.test(consNo) || !/^\d+$/.test(provinceCode)) throw new Error('请先填写完整户号并选择地区')
  const input = JSON.stringify({ consNo, provinceCode, observe })
  return `return (function () {
    'use strict';
    var input = ${input};
    var key = '__zhugeSgccMetadataV1';
    if (location.protocol !== 'https:' || !['www.95598.cn','95598.cn','csc-web.sgcc.com.cn'].includes(location.hostname)) {
      return {started:false,message:'请在95598官方网页完成登录'};
    }
    var root = document.querySelector('#app');
    var queue = root && root.__vue__ ? [root.__vue__] : [];
    var seen = new Set(); var ctx = null;
    while (queue.length && seen.size < 200) {
      var vm = queue.shift(); if (!vm || seen.has(vm)) continue; seen.add(vm);
      if (vm.$tools && typeof vm.$tools.apiPost === 'function' && vm.$store && vm.$store.getters) { ctx = vm; break; }
      if (Array.isArray(vm.$children)) queue.push.apply(queue,vm.$children);
    }
    if (!ctx) return {started:false,message:'官网尚未加载完成，请等登录页面完全打开后再点完成'};
    var getters = ctx.$store.getters;
    var token = getters.getToken; var userId = getters.getUserId;
    if (!input.observe && (typeof token !== 'string' || !token || !userId)) return {started:false,message:'请先在官网完成本人登录，再点完成读取资料'};
    function safeMessage(value) {
      return String(value || '官网未返回可用资料').replace(/[A-Za-z0-9_-]{24,}/g,'[已隐藏]').replace(/\\d{6,}/g,function(s){return '***'+s.slice(-4);}).slice(0,350);
    }
    function blocked(r) {
      var code = String(r && r.code || ''); var msg = String(r && r.message || '');
      return /^(?:RK\\d+|401|403|429|-200|-201|4006)$/.test(code) || /验证码|短信|安全验证|人机|频繁|限流|登录|无权限|禁止访问|系统正忙/.test(msg);
    }
    function sanitize(r) {
      var candidates = []; var stack = [{value:r,depth:0}]; var visited = new Set();
      while (stack.length && visited.size < 1000) {
        var node = stack.pop(); var v = node.value;
        if (!v || typeof v !== 'object' || visited.has(v) || node.depth > 8) continue; visited.add(v);
        if (Array.isArray(v)) { v.slice(0,100).forEach(function(x){stack.push({value:x,depth:node.depth+1});}); continue; }
        var ids = ['consNo_dst','powerUserNo_dst','consNoSrc','consNosrc','consNo','powerUserNo'].map(function(k){return String(v[k] == null ? '' : v[k]).trim();}).filter(function(x){return /^\\d+$/.test(x);});
        if (ids.includes(input.consNo)) {
          var org = String(v.orgNo == null ? '' : v.orgNo).trim();
          var pro = String(v.proNo || v.provinceId || v.osgNo || input.provinceCode).trim();
          if (/^\\d+$/.test(org) && pro === input.provinceCode) {
            var original = String(v.powerUserNo || v.consNo || input.consNo).trim();
            var elec = String(v.elecTypeCode || v.elecType || v.sceneType || '').trim();
            candidates.push({consNo:original,src:input.consNo,pro:pro,org:org,
              elec:/^\\d+$/.test(elec) ? elec : '',name:'',orgName:''});
          }
        }
        ['data','bizrt','dataList','consDetailLists','list','powerUserList','result'].forEach(function(k){
          if (v[k] && typeof v[k] === 'object') stack.push({value:v[k],depth:node.depth+1});
        });
      }
      var unique = new Map(); candidates.forEach(function(a){unique.set(a.org+'|'+a.consNo+'|'+a.elec,a);});
      if (unique.size > 1) throw new Error('官网返回多组不同的户号资料，无法自动选择');
      return unique.size === 1 ? Array.from(unique.values())[0] : null;
    }
    if (input.observe) {
      var original = ctx.$tools.apiPost;
      if (original.__zhugeSgccObserver === input.consNo+'|'+input.provinceCode) return {started:true,observing:true};
      var wrapped = function(payload,path) {
        var requested = payload && (payload.data && payload.data.consNo || payload.consLists && payload.consLists[0] && payload.consLists[0].consNo);
        var province = payload && (payload.data && payload.data.provCode || payload.provinceCode || payload.target);
        var allowed = ['/osg-open-uc0001/member/c9/f03','/osg-wp0002/member/charge/getElecUserChargeList'].includes(path);
        var result = original.apply(this,arguments);
        if (!allowed || String(requested) !== input.consNo || String(province) !== input.provinceCode) return result;
        return Promise.resolve(result).then(function(r){
          if (String(r && r.code) === '1') {
            try { var a = sanitize(r); if (a) window.__zhugeSgccObservedMetadataV1={ok:true,account:a}; } catch (_) {}
          }
          return r;
        });
      };
      wrapped.__zhugeSgccObserver = input.consNo+'|'+input.provinceCode;
      ctx.$tools.apiPost = wrapped;
      return {started:true,observing:true};
    }
    function request(payload,path) {
      return new Promise(function(resolve,reject){
        var timer = setTimeout(function(){reject(new Error('官网资料查询超时'));},20000);
        Promise.resolve().then(function(){return ctx.$tools.apiPost(payload,path);}).then(function(r){clearTimeout(timer);resolve(r);},function(e){clearTimeout(timer);reject(e);});
      });
    }
    window[key] = {pending:true};
    (async function(){
      var reasons = [];
      var requests = [
        {path:'/osg-open-uc0001/member/c9/f03',payload:{data:{consNo:input.consNo,pagerNo:0,pagerNum:1,provCode:input.provinceCode,cityCode:'',funcCode:'WEBA40050000',token:token,userId:userId,acctId:userId},serviceCode:'01010049',source:'0902',target:input.provinceCode}},
        {path:'/osg-wp0002/member/charge/getElecUserChargeList',payload:{token:token,chargeMode:'02',provinceCode:input.provinceCode,funcCode:'1',operNo:'1',accessorCode:'95598',accessorTypeId:'HTML',consLists:[{consNo:input.consNo}]}}
      ];
      for (var i=0;i<requests.length;i++) {
        var r = await request(requests[i].payload,requests[i].path);
        if (blocked(r)) throw new Error(safeMessage(r.message)+'；请先在官网完成验证或查询，不能自动跳过');
        if (String(r && r.code) !== '1') { reasons.push(safeMessage(r && (r.message || r.data && r.data.rtnMsg))); continue; }
        var a = sanitize(r);
        if (a) { window[key]={pending:false,ok:true,account:a}; return; }
        reasons.push('官网未返回本户号对应的供电单位资料');
      }
      window[key]={pending:false,ok:false,code:'metadata_missing',message:reasons.join('；')};
    })().catch(function(e){window[key]={pending:false,ok:false,code:'official_lookup',message:safeMessage(e && e.message)};});
    return {started:true};
  })();`
}

export function validateOfficialAccount(value: unknown, consNo: string, provinceCode: string): PowerAccount {
  const a = value as Partial<PowerAccount> | null
  if (!a || a.src !== consNo || a.pro !== provinceCode || typeof a.consNo !== 'string' || !a.consNo ||
    typeof a.org !== 'string' || !/^\d+$/.test(a.org)) {
    throw new Error('官网返回的户号、地区或供电单位不匹配，未保存资料')
  }
  return { consNo: a.consNo, src: consNo, pro: provinceCode, org: a.org,
    elec: typeof a.elec === 'string' && /^\d+$/.test(a.elec) ? a.elec : '', name: '', orgName: '' }
}

export async function readOfficialMetadata(preference: Preference): Promise<PowerAccount> {
  const script = buildOfficialLookupScript(preference.consNo.trim(), preference.provinceCode.trim())
  if (typeof WebViewController !== 'function') throw new Error('当前 Scripting 不支持内置网页，请先升级 Scripting')
  const web = new WebViewController({ ephemeral: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    web.setCustomUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')
    const loaded = await Promise.race([web.loadURL(OFFICIAL_URL), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('国网官网加载超时，请稍后重试')), 25000)
    })]).finally(() => { if (timer != null) clearTimeout(timer) })
    if (!loaded) throw new Error('国网官网加载失败')
    const observe = buildOfficialLookupScript(preference.consNo.trim(), preference.provinceCode.trim(), true)
    await web.evaluateJavaScript(`
      (function(){
        function install(){return (function(){${observe}})();}
        var installed=install();
        if (!installed.started) {
          var count=0;var timer=setInterval(function(){if(install().started || ++count>=120) clearInterval(timer);},750);
        }
      })(); return true;`)
    await web.present({ fullscreen: true, navigationTitle: '官网登录并查询此户号后，点完成' })
    const observed = await web.evaluateJavaScript<OfficialResult | null>('return window.__zhugeSgccObservedMetadataV1 || null')
    if (observed?.ok) return validateOfficialAccount(observed.account, preference.consNo.trim(), preference.provinceCode.trim())
    const started = await web.evaluateJavaScript<{ started?: boolean; message?: string }>(script)
    if (!started?.started) throw new Error(started?.message || '官网未就绪，请先完成登录')
    const until = Date.now() + 45000
    while (Date.now() < until) {
      const result = await web.evaluateJavaScript<OfficialResult | null>('return window.__zhugeSgccMetadataV1 || null')
      if (result && !result.pending) {
        if (!result.ok) throw new Error(result.message || '官网没有返回该户号的供电单位资料')
        return validateOfficialAccount(result.account, preference.consNo.trim(), preference.provinceCode.trim())
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 350))
    }
    throw new Error('官网资料查询等待超时，请稍后重试')
  } finally { web.dispose() }
}

/** Save only the requested household's minimal metadata; website tokens stay in its WebView. */
export async function syncOfficialMetadata(
  preference: Preference, acquire = readOfficialMetadata
): Promise<Preference> {
  const requestedKey = sourceKey(preference)
  const account = validateOfficialAccount(await acquire(preference), preference.consNo.trim(), preference.provinceCode.trim())
  if (sourceKey(loadPreference()) !== requestedKey) throw new Error('读取期间查询配置已改变，请重新获取资料')
  const now = Math.max(Date.now(), preference.metadataRevision + 1)
  const next = { ...preference, orgNo: account.org, elecType: account.elec || preference.elecType, metadataRevision: now }
  clearCache(); clearResolution()
  saveMetadata({ key: metadataKey(next), account, fetchedAt: now })
  savePreference(next)
  return next
}
