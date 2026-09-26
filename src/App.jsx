import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { createPortal } from 'react-dom'
import { createClient } from '@supabase/supabase-js'


/* ═════════════════ db.js ═════════════════ */

const SUPABASE_URL = 'https://vdubgrxwijydwfabwpnk.supabase.co'
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const hasKey = !!ANON

// 키가 없으면 createClient 가 예외를 던져 앱이 통째로 죽습니다.
// 빈 화면 대신 안내를 띄우려고 더미 키로 만들어 둡니다.
const supabase = createClient(SUPABASE_URL, ANON || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

// ---- 도메인 가드 ----
function domainGuard() {
  const h = location.hostname
  const ok =
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('aba-geomdan.github.io') ||
    h.endsWith('github.io')
  if (!ok) {
    document.body.innerHTML =
      '<div style="padding:40px;text-align:center;font-size:15px">허용되지 않은 도메인입니다.</div>'
    throw new Error('domain not allowed')
  }
}

// ---- 공통 ----
const ok = ({ data, error }) => {
  if (error) throw error
  return data
}

// 월 이동 (+1, -1)
const shiftYm = (ym, n) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 청구 기준월: 매달 20일부터는 다음 달을 기본으로 보여줍니다 (월초 결제 대비)
const defaultBillingYm = () => {
  const t = new Date()
  const cur = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
  return t.getDate() >= 20 ? shiftYm(cur, 1) : cur
}

// 마감 기준월: 매달 10일까지는 지난달을 기본으로 (지난달 마감을 처리하는 시기)
const defaultClosingYm = () => {
  const t = new Date()
  const cur = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
  return t.getDate() <= 10 ? shiftYm(cur, -1) : cur
}

const daysSince = (iso) =>
  Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000)

const ymOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const hhmm = (t) => (t || '').slice(0, 5)

const minutesBetween = (a, b) => {
  const [h1, m1] = a.split(':').map(Number)
  const [h2, m2] = b.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

const won = (n) => (n || 0).toLocaleString('ko-KR')

// ---- 인증 ----
async function signIn(email, password) {
  return ok(await supabase.auth.signInWithPassword({ email, password }))
}
async function signOut() {
  await supabase.auth.signOut()
}
async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

async function loadMe() {
  const isAdmin = ok(await supabase.rpc('is_admin'))
  const staff = ok(
    await supabase.from('staff').select('*').order('sort_order')
  )
  const { data: u } = await supabase.auth.getUser()
  const mine = staff.find((s) => s.auth_user_id === u?.user?.id) || null
  return { isAdmin: !!isAdmin, staff, me: mine }
}

// ---- 조회 ----
async function loadSessions(from, to) {
  return ok(
    await supabase
      .from('v_sessions')
      .select('*')
      .gte('d', from)
      .lte('d', to)
      .order('d')
      .order('start_time')
  )
}

async function loadToday() {
  return ok(await supabase.from('v_my_today').select('*'))
}

async function loadUnmadeUp() {
  return ok(await supabase.from('v_unmade_up').select('*'))
}

async function loadStudents() {
  return ok(
    await supabase.from('students').select('*').order('sort_order')
  )
}

async function loadPrograms() {
  return ok(await supabase.from('programs').select('*').eq('active', true).order('sort_order'))
}

async function loadBilling(ym) {
  return ok(await supabase.rpc('billing_lines', { p_ym: ym }))
}

async function loadBillingByStaff(ym) {
  return ok(await supabase.rpc('billing_by_staff', { p_ym: ym }))
}

async function loadPayments(ym) {
  return ok(await supabase.rpc('payment_status', { p_ym: ym }))
}

async function loadRevenue() {
  return ok(await supabase.rpc('monthly_revenue'))
}

async function addDeposit(studentId, { amount, date, method, memo }) {
  return ok(
    await supabase.rpc('add_deposit', {
      p_student: studentId, p_amount: amount,
      p_date: date, p_method: method ?? null, p_memo: memo ?? null,
    })
  )
}

async function addRefund(studentId, { amount, date, method, memo }) {
  return ok(
    await supabase.rpc('add_refund', {
      p_student: studentId, p_amount: amount,
      p_date: date, p_method: method ?? null, p_memo: memo ?? null,
    })
  )
}

async function removeDeposit(id) {
  return ok(await supabase.rpc('remove_deposit', { p_id: id }))
}

async function depositHistory(studentId) {
  return ok(await supabase.rpc('deposit_history', { p_student: studentId }))
}

async function loadPayroll(ym) {
  return ok(await supabase.rpc('payroll', { p_ym: ym }))
}

async function loadPayrollDetail(ym, staffId) {
  return ok(await supabase.rpc('payroll_detail', { p_ym: ym, p_staff: staffId }))
}

async function setPayRate(staffId, rate) {
  return ok(await supabase.rpc('set_pay_rate', { p_staff: staffId, p_rate: rate }))
}

async function loadClosings(ym) {
  return ok(await supabase.from('v_closing_status').select('*').eq('ym', ym))
}

// 선생님 본인 마감 현황 (마감 요청 전에도 실적이 보입니다)
async function loadMyClosing(ym) {
  const rows = ok(await supabase.rpc('my_closing', { p_ym: ym }))
  return rows?.[0] || null
}

// 영수증 취소 차감 · 선입금 (발행된 건 적어 둔 값, 아니면 지금 기준 계산)
async function loadReceiptExtras(ym) {
  return ok(await supabase.rpc('receipt_extras', { p_ym: ym }))
}

// 영수증 발행 뒤 취소 → 다음 영수증에서 차감
async function cancelWithCarry(sessionId, reason) {
  return ok(await supabase.rpc('cancel_with_carry', { p_session: sessionId, p_reason: reason ?? null }))
}
async function undoCancelCarry(sessionId) {
  return ok(await supabase.rpc('undo_cancel_carry', { p_session: sessionId }))
}

// 영수증 금액 계산 (화면용) — 조정 금액을 바꿔 보는 중에도 같은 규칙으로
function receiptShow(subtotal, adjustment, x) {
  const carry = x?.carry_amount || 0
  const net = subtotal + (adjustment || 0) + carry
  const credit = (x?.prepaid_used || 0) + (x?.prepaid_left || 0)   // 쓸 수 있는 선입금
  const used = Math.min(credit, Math.max(net, 0))
  const left = credit - used
  const due = net - used
  const full = used > 0 && used === net                             // 선입금으로 전부 결제
  const months = full && net > 0 ? Math.floor(left / net) : 0
  return { carry, note: x?.carry_note || '', net, used, left, due, full, months }
}

async function loadReceipts(ym) {
  return ok(await supabase.from('receipts').select('*').eq('ym', ym))
}

async function loadHolidays(from, to) {
  return ok(await supabase.from('holidays').select('*').gte('d', from).lte('d', to))
}

// ---- 쓰기 ----
async function markAttendance(id, status, note) {
  return ok(
    await supabase.rpc('mark_attendance', {
      p_session: id,
      p_status: status,
      p_note: note ?? null,
    })
  )
}

// 원장님: 상태 직접 변경 (보강 포함)
// 수업 한 회차 직접 추가 (지난 결강 기록 / 보강 등록)
async function addSession(v) {
  return ok(
    await supabase.rpc('add_session', {
      p_student: v.student_id,
      p_staff: v.staff_id,
      p_program: v.program_code,
      p_date: v.d,
      p_start: v.start_time,
      p_end: v.end_time,
      p_status: v.status,
      p_makeup_for: v.makeup_for ?? null,
      p_note: v.note ?? null,
    })
  )
}

async function generateMonth(ym) {
  return ok(await supabase.rpc('generate_sessions', { p_ym: ym }))
}

async function requestClosing(ym, staffId) {
  return ok(await supabase.rpc('request_closing', { p_ym: ym, p_staff: staffId ?? null }))
}

async function submitClosing(ym) {
  return ok(await supabase.rpc('submit_closing', { p_ym: ym }))
}

async function reviewClosing(ym, staffId, approve, reason) {
  return ok(
    await supabase.rpc('review_closing', {
      p_ym: ym,
      p_staff: staffId,
      p_approve: approve,
      p_reason: reason ?? null,
    })
  )
}

async function issueReceipt(ym, studentId) {
  return ok(await supabase.rpc('issue_receipt', { p_ym: ym, p_student: studentId }))
}

async function unlockReceipt(ym, studentId) {
  return ok(await supabase.rpc('unlock_receipt', { p_ym: ym, p_student: studentId }))
}

async function saveAdjust(ym, studentId, amount, reason) {
  return ok(
    await supabase
      .from('receipts')
      .update({ adjustment: amount, adjust_reason: reason })
      .eq('ym', ym)
      .eq('student_id', studentId)
  )
}

async function loadTemplates() {
  return ok(
    await supabase
      .from('schedule_templates')
      .select('*')
      .order('weekday')
      .order('start_time')
  )
}

// 보강 기록 (어느 결강을 언제 보강했는지)
async function loadMakeupLog(ym) {
  return ok(await supabase.rpc('makeup_log', { p_ym: ym ?? null }))
}

// 직접 추가한 수업 · 보강 지우기
async function removeSession(id) {
  return ok(await supabase.rpc('remove_session', { p_session: id }))
}

// 그 달 그 선생님 마감 (한 번에) · 취소
async function closeMonth(ym, staffId, undo) {
  return ok(await supabase.rpc('close_month', { p_ym: ym, p_staff: staffId, p_undo: !!undo }))
}

// 급여 기록 (마감할 때 저장된 것)
async function loadPayrollHistory(from, to) {
  return ok(await supabase.rpc('payroll_history', { p_from: from || null, p_to: to || null }))
}
async function markPayrollPaid(ym, staffId, on, memo) {
  return ok(await supabase.rpc('mark_payroll_paid', { p_ym: ym, p_staff: staffId, p_on: on ?? null, p_memo: memo ?? null }))
}

// 아동 상태 바꾸기 (퇴소·휴원은 '언제부터'를 같이 보냅니다)
async function setStudentStatus(id, status, from) {
  return ok(await supabase.rpc('set_student_status', { p_student: id, p_status: status, p_from: from || null }))
}

async function saveStudent(id, v) {
  if (id) return ok(await supabase.from('students').update(v).eq('id', id))
  return ok(await supabase.from('students').insert(v))
}

// 시간표 변경 — 언제부터 바뀌는지 지정 (지난 기록은 그대로)
// 다음 달 시간표 짜기
async function loadMonthPlan(ym) {
  return ok(await supabase.rpc('month_plan', { p_ym: ym }))
}

async function loadPlanLocked(ym) {
  return ok(await supabase.rpc('month_plan_locked', { p_ym: ym }))
}

async function checkMonthPlan(rows) {
  return ok(await supabase.rpc('check_month_plan', { p_rows: rows }))
}

async function applyMonthPlan(ym, rows) {
  return ok(await supabase.rpc('apply_month_plan', { p_ym: ym, p_rows: rows }))
}

async function loadPlanBackups() {
  return ok(await supabase.rpc('plan_backup_list'))
}

async function restorePlanBackup(id) {
  return ok(await supabase.rpc('restore_plan_backup', { p_id: id }))
}

async function removeStudent(id) {
  return ok(await supabase.rpc('remove_student', { p_id: id }))
}

// 외부 일정 (수업 아님 — 학교 자문·슈퍼비전 등)
// 홈 화면 요약
async function loadHome(ym) {
  const r = ok(await supabase.rpc('home_summary', { p_ym: ym }))
  return Array.isArray(r) ? r[0] || null : r
}

async function loadRecentSessions(days = 7) {
  return ok(await supabase.rpc('recent_sessions', { p_days: days }))
}

async function loadOutside() {
  return ok(await supabase.from('v_outside').select('*').order('d'))
}

async function addOutside(v) {
  return ok(
    await supabase.rpc('add_outside_event', {
      p_d: v.d, p_start: v.start_time, p_end: v.end_time,
      p_label: v.label, p_memo: v.memo ?? null,
    })
  )
}

async function removeOutside(id) {
  return ok(await supabase.rpc('remove_outside_event', { p_id: id }))
}

async function loadLeaves() {
  return ok(await supabase.from('v_leaves').select('*'))
}

async function addLeave({ d, label, staffId, mode }) {
  return ok(
    await supabase.rpc('add_leave', {
      p_date: d,
      p_label: label || null,
      p_staff: staffId || null,
      p_mode: mode || '취소',
    })
  )
}

async function seedHolidays(list) {
  return ok(await supabase.rpc('seed_holidays', { p_list: list }))
}

async function removeLeave(id) {
  return ok(await supabase.rpc('remove_leave', { p_id: id }))
}


/* ═════════════════ ui.jsx ═════════════════ */

const C = {
  pk: '#F5A0B1',
  pkd: '#D4728A',
  pkl: '#FFF0F3',
  ink: '#1F2328',
  sub: '#71757C',
  mut: '#9AA0A6',
  line: '#E9EAEC',
  line2: '#F5F6F7',
  bg: '#FAFAFB',
  danger: '#AE2340',
  ok: '#2E9E8F',
}

const STATUS = {
  진행: { bg: '#EDF7F1', bd: '#BFE3CE', fg: '#1F5B3A' },
  결강완: { bg: '#FEF6E7', bd: '#F0D49B', fg: '#8A5A00' },
  미보강: { bg: '#FDECEF', bd: '#F3AFBD', fg: '#AE2340' },
  보강: { bg: '#EEF3FD', bd: '#C3D4F2', fg: '#254B8C' },
  취소: { bg: '#F4F4F5', bd: '#E4E4E7', fg: '#A1A1AA' },
}

// 선생님 색 8가지 — 앞의 4가지는 지금 선생님들 색 그대로.
// 주황(보강)·노랑(빈 시간)·빨강(휴무)·진회색(외부 일정)은 선생님에게 쓰지 않습니다.
const TEACHER_COLORS = [
  '#D4728A', // 0 분홍
  '#4A7FD4', // 1 파랑
  '#2E9E8F', // 2 초록
  '#9B72C4', // 3 보라
  '#6E9A2C', // 4 올리브
  '#9A6B4B', // 5 갈색
  '#4E56C4', // 6 남색
  '#5E7C93', // 7 청회색
]

// 시간표 칸 배경용 — 위 순서와 짝
const TEACHER_TONES = [
  { bg: '#FBEAF0', bd: '#ED93B1', fg: '#72243E' },
  { bg: '#E6F1FB', bd: '#85B7EB', fg: '#0C447C' },
  { bg: '#E1F5EE', bd: '#5DCAA5', fg: '#085041' },
  { bg: '#F0EAFA', bd: '#B59BE0', fg: '#3F2570' },
  { bg: '#EFF5E3', bd: '#A9C97A', fg: '#3B5512' },
  { bg: '#F4ECE6', bd: '#CFAE95', fg: '#5A3A22' },
  { bg: '#ECEDFB', bd: '#A3A8E8', fg: '#262C80' },
  { bg: '#EAF0F4', bd: '#A9BCCB', fg: '#2C4252' },
]

function styleOf(s) {
  if (s.status === '결강') return s.needs_makeup ? STATUS.미보강 : STATUS.결강완
  return STATUS[s.status] || STATUS.진행
}

function Card({ children, style, ...p }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        ...style,
      }}
      {...p}
    >
      {children}
    </div>
  )
}

function Btn({ children, variant = 'default', style, ...p }) {
  const v = {
    default: { bg: '#fff', fg: '#4B5057', bd: '#DEE0E3' },
    primary: { bg: C.ink, fg: '#fff', bd: C.ink },
    danger: { bg: '#FDECEF', fg: C.danger, bd: '#F3AFBD' },
    ok: { bg: '#EDF7F1', fg: '#1F5B3A', bd: '#BFE3CE' },
    ghost: { bg: 'transparent', fg: C.sub, bd: 'transparent' },
  }[variant]
  return (
    <button
      style={{
        padding: '9px 14px',
        borderRadius: 8,
        border: `1px solid ${v.bd}`,
        background: v.bg,
        color: v.fg,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: p.disabled ? 'not-allowed' : 'pointer',
        opacity: p.disabled ? 0.5 : 1,
        ...style,
      }}
      {...p}
    >
      {children}
    </button>
  )
}

function Pill({ children, tone = 'gray' }) {
  const t = {
    gray: ['#F2F3F5', C.sub],
    blue: ['#EEF3FD', '#254B8C'],
    green: ['#EDF7F1', '#1F5B3A'],
    amber: ['#FEF6E7', '#8A5A00'],
    pink: ['#FDECEF', C.danger],
  }[tone]
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        padding: '3px 9px',
        borderRadius: 99,
        background: t[0],
        color: t[1],
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ background: '#FAFAFB', borderRadius: 9, padding: '10px 12px', flex: 1 }}>
      <div style={{ fontSize: 11.5, color: C.sub }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 1, color: tone || C.ink }}>{value}</div>
    </div>
  )
}

function Empty({ children }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: C.mut, fontSize: 13 }}>{children}</div>
  )
}

function Loading() {
  return <div style={{ padding: 40, textAlign: 'center', color: C.mut, fontSize: 13 }}>불러오는 중…</div>
}

function Modal({ children, onClose, max = 400 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,22,25,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 60,
        overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: max, overflow: 'hidden' }}
      >
        {children}
      </div>
    </div>
  )
}

function Toast({ msg, tone = 'ok' }) {
  if (!msg) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 26,
        background: tone === 'err' ? C.danger : C.ink,
        color: '#fff',
        padding: '11px 18px',
        borderRadius: 10,
        fontSize: 13.5,
        fontWeight: 600,
        zIndex: 90,
        maxWidth: '90vw',
        textAlign: 'center',
      }}
    >
      {msg}
    </div>
  )
}


/* ═════════════════ WeekGrid.jsx ═════════════════ */

const DAY_START = 540 // 09:00
// 휴무일 색 — 다른 달·빈 칸의 회색과 헷갈리지 않게 분홍 계열로
const HOLIDAY = {
  bg: 'repeating-linear-gradient(135deg, #F6C9D3 0px, #F6C9D3 4px, #FFFFFF 4px, #FFFFFF 10px)',
  fg: '#AE2340',
  pill: '#C8324F',
}
// 보강 — 어느 선생님이든 같은 표시 (흰 바탕 · 점선 · 주황 이름표)
const MAKEUP = '#E07B00'
// 원장 외부 일정 — 수업(연한 색)과 확실히 다르게 진한 회색
const OUTSIDE = { bg: '#3F4652', bd: '#2B3038', fg: '#FFFFFF', tag: '#C9CED6' }
const DAY_END = 1200 // 20:00
const PX = 1.02

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 시간이 겹치는 수업을 가로로 나눠 배치
// 선생님마다 고정된 세로 열을 줍니다.
//   같은 선생님이 같은 시간에 두 수업을 할 수 없으므로 열이 겹치지 않고,
//   하루 안에서 한 선생님 수업이 같은 줄에 쭉 이어집니다.
function layout(items, names) {
  if (!items.length || !names.length) return []
  const cols = names.length
  return items.map((s) => {
    const i = names.indexOf(s.staff_name)
    return { s, col: i < 0 ? 0 : i, cols }
  })
}


function WeekGrid({ weekStart, sessions, holidays, outside = [], ownerName, colorOf, toneOf, staffOrder = [], onPick, today }) {
  const days = useMemo(
    () =>
      [...Array(6)].map((_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return d
      }),
    [weekStart]
  )

  const holidayMap = useMemo(() => {
    const m = {}
    holidays.forEach((h) => {
      if (!h.staff_id) m[h.d] = h.label || '휴무'
    })
    return m
  }, [holidays])

  const outByDay = useMemo(() => {
    const m = {}
    outside.forEach((e) => {
      if (!m[e.d]) m[e.d] = []
      m[e.d].push(e)
    })
    return m
  }, [outside])

  // 주 전체에서 수업이 있는 선생님을 순서대로 — 모든 날이 같은 폭, 같은 줄을 씁니다
  const weekNames = useMemo(() => {
    const seen = new Set(sessions.map((s) => s.staff_name))
    const weekIso = new Set(Array.from({ length: 6 }, (_, i) => {
      const x = new Date(weekStart); x.setDate(x.getDate() + i); return isoOf(x)
    }))
    if (ownerName && outside.some((e) => weekIso.has(e.d))) seen.add(ownerName)
    const ordered = staffOrder.filter((n) => seen.has(n))
    const rest = [...seen].filter((n) => !staffOrder.includes(n)).sort((a, b) => a.localeCompare(b, 'ko'))
    return [...ordered, ...rest]
  }, [sessions, staffOrder, outside, ownerName, weekStart])
  const height = (DAY_END - DAY_START) * PX

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(6, 1fr)' }}>
        <div style={{ borderBottom: `1px solid ${C.line}`, background: '#FBFBFC' }} />
        {days.map((d, i) => {
          const isToday = isoOf(d) === today
          const hol = holidayMap[isoOf(d)]
          return (
            <div
              key={i}
              style={{
                padding: '8px 0',
                textAlign: 'center',
                borderLeft: `2px solid ${C.line}`,
                borderBottom: `1px solid ${C.line}`,
                background: hol
                  ? HOLIDAY.bg
                  : isToday
                    ? '#E6F1FB'
                    : d.getDay() === 6
                      ? '#F7F5EF'
                      : i % 2 === 1
                        ? '#F4F5F6'
                        : '#FBFBFC',
              }}
            >
              <div style={{ fontSize: 10.5, color: hol ? HOLIDAY.fg : C.mut }}>{'일월화수목금토'[d.getDay()]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: hol ? HOLIDAY.fg : isToday ? '#0C447C' : C.ink }}>
                {d.getDate()}
                {isToday && !hol && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 4 }}>오늘</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(6, 1fr)' }}>
        <div style={{ position: 'relative', height, background: '#FBFBFC' }}>
          {Array.from(
            { length: Math.floor((DAY_END - DAY_START) / 60) + 1 },
            (_, i) => DAY_START + i * 60
          ).map((m) => (
            <div
              key={m}
              style={{
                position: 'absolute',
                top: (m - DAY_START) * PX - 6,
                right: 6,
                fontSize: 10,
                color: '#B4B8BD',
              }}
            >
              {String(Math.floor(m / 60)).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {days.map((d, i) => {
          const ds = isoOf(d)
          const hol = holidayMap[ds]
          const isHoliday = !!hol
          const items = sessions.filter((s) => s.d === ds)
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                height,
                // 요일 경계를 뚜렷하게, 홀짝으로 배경을 살짝 다르게
                borderLeft: `2px solid ${C.line}`,
                background: isHoliday
                  ? HOLIDAY.bg
                  : d.getDay() === 6
                    ? '#FCFBF8'
                    : i % 2 === 1
                      ? '#FAFAFB'
                      : '#fff',
              }}
            >
              {Array.from({ length: Math.floor((DAY_END - DAY_START) / 60) }, (_, k) => (
                <div
                  key={k}
                  style={{
                    position: 'absolute',
                    top: (k + 1) * 60 * PX,
                    left: 0,
                    right: 0,
                    borderTop: '1px solid #F5F6F7',
                  }}
                />
              ))}
              {isHoliday && (
                <div
                  style={{
                    position: 'absolute', top: 10, left: 0, right: 0,
                    display: 'flex', justifyContent: 'center', pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: 12.5, fontWeight: 700, color: '#fff', background: HOLIDAY.pill,
                      borderRadius: 99, padding: '3px 11px',
                    }}
                  >
                    {hol}
                  </span>
                </div>
              )}
              {(outByDay[ds] || []).map((e) => {
                const top = (toMin(e.start_time) - DAY_START) * PX
                const eh = (toMin(e.end_time) - toMin(e.start_time)) * PX
                // 원장 줄에 놓습니다 (원장 수업과 같은 줄, 색만 다르게)
                const lane = ownerName ? weekNames.indexOf(ownerName) : -1
                const n = Math.max(weekNames.length, 1)
                const w = 100 / n
                return (
                  <div
                    key={e.id}
                    title={`${e.label}${e.memo ? ' · ' + e.memo : ''}`}
                    style={{
                      position: 'absolute',
                      top: top + 1,
                      height: Math.max(eh - 3, 18),
                      left: lane >= 0 ? `calc(${lane * w}% + 2px)` : 2,
                      width: lane >= 0 ? `calc(${w}% - 4px)` : 'calc(100% - 4px)',
                      borderRadius: 7,
                      background: OUTSIDE.bg,
                      border: `1px solid ${OUTSIDE.bd}`,
                      padding: n >= 3 ? '2px 3px' : '3px 6px',
                      overflow: 'hidden',
                      zIndex: 2,
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, color: OUTSIDE.tag, letterSpacing: '0.02em' }}>외부</div>
                    <div style={{ fontSize: n >= 3 ? 10 : 11.5, fontWeight: 700, color: OUTSIDE.fg, lineHeight: 1.25 }}>
                      {e.label}
                    </div>
                    {eh > 44 && n < 3 && (
                      <div style={{ fontSize: 9.5, color: OUTSIDE.tag, marginTop: 1 }}>
                        {hhmm(e.start_time)}~{hhmm(e.end_time)}
                      </div>
                    )}
                  </div>
                )
              })}

              {layout(items, weekNames).map(({ s, col, cols }) => {
                // 배경은 선생님 색, 결강·취소는 빗금과 취소선으로 구분합니다
                const tone = toneOf ? toneOf(s.staff_name) : styleOf(s)
                const tc = colorOf(s.staff_name)
                const off = s.status === '결강' || s.status === '취소'
                const isMakeup = s.status === '보강'
                const h = (toMin(s.end_time) - toMin(s.start_time)) * PX
                const w = 100 / cols
                const narrow = cols > 1
                return (
                  <button
                    key={s.id}
                    onClick={() => onPick(s)}
                    title={`${s.student_name} · ${s.staff_name} · ${hhmm(s.start_time)}-${hhmm(s.end_time)}`}
                    style={{
                      position: 'absolute',
                      top: (toMin(s.start_time) - DAY_START) * PX,
                      left: `calc(${col * w}% + 2px)`,
                      width: `calc(${w}% - 4px)`,
                      height: Math.max(h - 2, 18),
                      background: off
                        ? `repeating-linear-gradient(135deg, ${tone.bg}, ${tone.bg} 5px, #FFFFFF 5px, #FFFFFF 10px)`
                        : isMakeup
                          ? '#FFFFFF'
                          : tone.bg,
                      border: isMakeup ? `1.5px dashed ${MAKEUP}` : `1px solid ${tone.bd}`,
                      borderLeft: `3px solid ${tc}`,
                      opacity: off ? 0.75 : 1,
                      borderRadius: 5,
                      padding: cols >= 3 ? '2px 1px' : narrow ? '2px 3px' : '3px 5px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      display: 'block',
                    }}
                  >
                    {isMakeup && (
                      <span
                        style={{
                          display: 'inline-block', fontSize: narrow ? 8.5 : 9.5, fontWeight: 700, color: '#fff',
                          background: MAKEUP, borderRadius: 99, padding: narrow ? '0 4px' : '0 6px', marginBottom: 1,
                        }}
                      >
                        보강
                      </span>
                    )}
                    <div
                      style={{
                        fontSize: cols >= 3 ? 9.5 : narrow ? 10.5 : 12,
                        fontWeight: 700,
                        color: tone.fg,
                        textDecoration: off ? 'line-through' : 'none',
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.student_name}
                    </div>
                    {h > 44 && !narrow && (
                      <div style={{ fontSize: 10, color: tone.fg, opacity: 0.75 }}>
                        {hhmm(s.start_time)}
                      </div>
                    )}
                    {h > 40 && narrow && cols <= 2 && (
                      <div style={{ fontSize: 9, color: tone.fg, opacity: 0.7, whiteSpace: 'nowrap' }}>
                        {(s.staff_name || '').slice(-2)}
                      </div>
                    )}
                    {s.status === '결강' && h > 52 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.danger }}>
                        {s.needs_makeup ? '결강 · 미보강' : '결강 · 보강완료'}
                      </div>
                    )}
                    {s.status === '결강' && h <= 52 && !narrow && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.danger }}>결강</div>
                    )}
                    {s.status === '취소' && h > 40 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.mut }}>취소</div>
                    )}

                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </Card>
  )
}


/* ═════════════════ MonthView.jsx ═════════════════ */

const DOT = {
  진행: { bg: '#E1F5EE', bd: '#5DCAA5', fg: '#085041' },
  결강완: { bg: '#FAEEDA', bd: '#EF9F27', fg: '#633806' },
  미보강: { bg: '#FBEAF0', bd: '#ED93B1', fg: '#72243E' },
  보강: { bg: '#E6F1FB', bd: '#85B7EB', fg: '#0C447C' },
  취소: { bg: '#F1EFE8', bd: '#D3D1C7', fg: '#5F5E5A' },
}

const toneOf = (s) => {
  if (s.status === '결강') return s.needs_makeup ? DOT.미보강 : DOT.결강완
  if (s.status === '보강') return DOT.보강
  if (s.status === '취소') return DOT.취소
  return DOT.진행
}

// 달력 기준 주차 (그 달 1일이 속한 주가 1주차, 일요일 시작)
function weekIndex(iso) {
  const d = new Date(iso + 'T00:00:00')
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  return Math.floor((d.getDate() + first.getDay() - 1) / 7)
}

function weekCount(ym) {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const days = new Date(y, m, 0).getDate()
  return Math.ceil((days + first.getDay()) / 7)
}

function MonthView({
  ym, sessions, onPrevYm, onNextYm, onMark, busy, isAdmin, staff, filter, onFilter, colorOf,
}) {
  const [open, setOpen] = useState(null)
  const weeks = weekCount(ym)

  const rows = useMemo(() => {
    const m = {}
    sessions.forEach((s) => {
      if (!m[s.student_name])
        m[s.student_name] = {
          name: s.student_name,
          program: s.program_label,
          staffName: s.staff_name,
          list: [],
        }
      m[s.student_name].list.push(s)
    })
    return Object.values(m)
      .map((g) => {
        const list = g.list.slice().sort((a, b) => a.d.localeCompare(b.d))
        const byWeek = Array.from({ length: weeks }, () => [])
        list.forEach((s) => {
          const i = weekIndex(s.d)
          if (byWeek[i]) byWeek[i].push(s)
        })
        const days = [...new Set(list.map((s) => s.weekday))]
        // 이 달에 가르친 선생님 전부 (요일과 함께)
        const DOW = '일월화수목금토'
        const byTeacher = {}
        list
          .filter((x) => x.status !== '취소')
          .forEach((x) => {
            const w = DOW[new Date(x.d + 'T00:00:00').getDay()]
            if (!byTeacher[x.staff_name]) byTeacher[x.staff_name] = new Set()
            byTeacher[x.staff_name].add(w)
          })
        const order = '월화수목금토일'
        const teachers = Object.entries(byTeacher)
          .map(([n, ws]) => ({ name: n, days: [...ws].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('') }))
          .sort((a, b) => order.indexOf(a.days[0]) - order.indexOf(b.days[0]))
        return {
          ...g,
          teachers,
          list,
          byWeek,
          days: days.join('·'),
          done: list.filter((x) => x.status === '진행' || x.status === '보강').length,
          absent: list.filter((x) => x.status === '결강').length,
          unmade: list.filter((x) => x.status === '결강' && x.needs_makeup).length,
          minutes: list
            .filter((x) => x.status === '진행' || x.status === '보강')
            .reduce((a, b) => a + minutesBetween(b.start_time, b.end_time), 0),
          total: list.filter((x) => x.status !== '취소').length,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [sessions, weeks])

  const sum = useMemo(
    () => ({
      done: rows.reduce((a, b) => a + b.done, 0),
      absent: rows.reduce((a, b) => a + b.absent, 0),
      minutes: rows.reduce((a, b) => a + b.minutes, 0),
    }),
    [rows]
  )

  const colW = 32

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Btn onClick={onPrevYm} style={{ padding: '6px 12px' }}>←</Btn>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
          {ym.replace('-', '년 ')}월
        </div>
        <Btn onClick={onNextYm} style={{ padding: '6px 12px' }}>→</Btn>
      </div>

      {isAdmin && staff && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
          <Btn
            variant={!filter ? 'primary' : 'default'}
            onClick={() => onFilter(null)}
            style={{ padding: '5px 11px', fontSize: 12.5, borderRadius: 99 }}
          >
            전체
          </Btn>
          {staff.filter((x) => x.active).map((x) => (
            <Btn
              key={x.id}
              onClick={() => onFilter(filter === x.name ? null : x.name)}
              style={{
                padding: '5px 11px', fontSize: 12.5, borderRadius: 99,
                background: filter === x.name ? colorOf(x.name) : '#fff',
                color: filter === x.name ? '#fff' : C.sub,
                borderColor: filter === x.name ? colorOf(x.name) : '#E3E5E8',
              }}
            >
              {x.name}
            </Btn>
          ))}
        </div>
      )}

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.line2}`, display: 'flex', gap: 18 }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub }}>한 수업</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{sum.done}회</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub }}>결강</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: sum.absent ? C.danger : C.ink }}>
              {sum.absent}회
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub }}>시수</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{(sum.minutes / 60).toFixed(1)}h</div>
          </div>
        </div>

        <div
          style={{
            display: 'flex', padding: '7px 14px', background: '#FBFBFC',
            borderBottom: `1px solid ${C.line}`, fontSize: 11, color: C.sub,
          }}
        >
          <span style={{ flex: 1, minWidth: 60 }}>아동</span>
          {Array.from({ length: weeks }, (_, i) => (
            <span key={i} style={{ width: colW, textAlign: 'center' }}>{i + 1}주</span>
          ))}
          <span style={{ width: 30, textAlign: 'right' }}>계</span>
        </div>

        {rows.length === 0 ? (
          <Empty>이 달 수업이 없습니다.</Empty>
        ) : (
          rows.map((g) => {
            const isOpen = open === g.name
            return (
              <div
                key={g.name}
                style={{ borderBottom: `1px solid ${C.line2}`, background: isOpen ? '#FDF6F8' : '#fff' }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : g.name)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 0,
                    padding: '10px 14px', border: 'none', background: 'none',
                    cursor: 'pointer', fontSize: 13, textAlign: 'left', color: C.sub,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 60, color: C.ink, fontWeight: 700 }}>
                    <span style={{ color: C.mut, marginRight: 5, fontSize: 11 }}>
                      {isOpen ? '▾' : '▸'}
                    </span>
                    {g.name}
                    {isAdmin && (
                      <span style={{ color: C.mut, fontWeight: 400, fontSize: 11, marginLeft: 5 }}>
                        {g.teachers.length > 1
                          ? g.teachers.map((t) => `${t.days} ${t.name}`).join(' · ')
                          : g.teachers[0]?.name || g.staffName}
                      </span>
                    )}
                  </span>
                  {g.byWeek.map((w, i) => {
                    const n = w.filter((x) => x.status !== '취소').length
                    const bad = w.some((x) => x.status === '결강')
                    if (!n) return <span key={i} style={{ width: colW, textAlign: 'center', color: '#C9CCD1' }}>—</span>
                    return (
                      <span key={i} style={{ width: colW, textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block', width: 22, height: 22, lineHeight: '22px',
                            borderRadius: 6, fontSize: 12,
                            background: bad ? DOT.미보강.bg : 'transparent',
                            color: bad ? DOT.미보강.fg : C.sub,
                            fontWeight: bad ? 700 : 400,
                          }}
                        >
                          {n}
                        </span>
                      </span>
                    )
                  })}
                  <span style={{ width: 30, textAlign: 'right', color: C.ink, fontWeight: 700 }}>
                    {g.total}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 14px 12px' }}>
                    <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 7 }}>
                      <span>{g.days} · {g.program}</span>
                      {g.unmade > 0 && (
                        <span style={{ color: '#8A5A00', marginLeft: 7 }}>· 미보강 {g.unmade}</span>
                      )}
                      <span style={{ marginLeft: 7 }}>· 날짜를 눌러 결강 처리</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {g.list.map((s) => {
                        const c = toneOf(s)
                        return (
                          <button
                            key={s.id}
                            disabled={busy}
                            title={`${s.d.slice(5)} (${s.weekday}) ${hhmm(s.start_time)} · ${s.status}`}
                            onClick={() => onMark(s.id, s.status === '결강' ? '진행' : '결강')}
                            style={{
                              width: 34, height: 34, borderRadius: 8,
                              border: `1px solid ${c.bd}`, background: c.bg, color: c.fg,
                              fontSize: 12.5, fontWeight: 700, padding: 0,
                              cursor: busy ? 'default' : 'pointer', position: 'relative',
                            }}
                          >
                            {Number(s.d.slice(-2))}
                            {s.status === '보강' && (
                              <span style={{ position: 'absolute', top: -2, right: -2, fontSize: 9 }}>↻</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </Card>

      <div style={{ display: 'flex', gap: 12, marginTop: 11, flexWrap: 'wrap', fontSize: 11, color: C.sub }}>
        {[['수업함', DOT.진행], ['결강', DOT.미보강], ['보강 완료', DOT.결강완], ['보강 수업', DOT.보강], ['취소', DOT.취소]].map(
          ([l, c]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: c.bg, border: `1px solid ${c.bd}` }} />
              {l}
            </span>
          )
        )}
      </div>
    </div>
  )
}


/* ═════════════════ TeacherViews.jsx ═════════════════ */

function TodayView({ today, weekMinutes, onMark, busy }) {
  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <Card style={{ flex: 1, padding: '12px 14px' }}>
          <div style={{ fontSize: 11.5, color: C.sub }}>오늘 수업</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{today.length}건</div>
        </Card>
        <Card style={{ flex: 1, padding: '12px 14px' }}>
          <div style={{ fontSize: 11.5, color: C.sub }}>이번 주 시수</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
            {(weekMinutes / 60).toFixed(1)}h
          </div>
        </Card>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>오늘 수업</div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 9, lineHeight: 1.6 }}>
        <b style={{ color: C.danger }}>아이가 안 온 수업만</b> 눌러주세요. 정상 진행한 수업은 따로 누르지
        않아도 됩니다.
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {today.length === 0 ? (
          <Empty>오늘 수업이 없습니다.</Empty>
        ) : (
          today.map((s) => {
            const st = STATUS[s.status] || STATUS.진행
            return (
              <div key={s.id} style={{ padding: '13px 15px', borderBottom: `1px solid ${C.line2}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12.5, color: C.sub, minWidth: 44, fontWeight: 600 }}>
                    {hhmm(s.start_time)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{s.student_name}</div>
                    <div style={{ fontSize: 11.5, color: C.mut }}>
                      {s.program_label} · {minutesBetween(s.start_time, s.end_time)}분
                    </div>
                  </div>
                  {s.status !== '진행' && (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '4px 9px',
                        borderRadius: 99,
                        background: st.bg,
                        color: st.fg,
                        border: `1px solid ${st.bd}`,
                      }}
                    >
                      {s.status}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  {s.status === '진행' || s.status === '결강' ? (
                    <Btn
                      disabled={busy}
                      variant={s.status === '결강' ? 'default' : 'danger'}
                      onClick={() => onMark(s.id, s.status === '결강' ? '진행' : '결강')}
                      style={{ width: '100%', padding: '10px 0' }}
                    >
                      {s.status === '결강' ? '되돌리기' : '결강'}
                    </Btn>
                  ) : (
                    <div style={{ fontSize: 12, color: C.sub, textAlign: 'center' }}>
                      {s.status === '취소' ? '원장님이 취소한 수업입니다' : '보강 수업입니다'}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}

function MyClosingView({ ym, summary, closing, onSubmit, onPrevYm, onNextYm, busy }) {
  const st = closing?.status
  const done = st === '제출' || st === '승인'

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Btn onClick={onPrevYm} style={{ padding: '6px 12px' }}>←</Btn>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
          {ym.replace('-', '년 ')}월
        </div>
        <Btn onClick={onNextYm} style={{ padding: '6px 12px' }}>→</Btn>
      </div>

      <Card style={{ padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 마감</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
          {st === '요청'
            ? '원장님이 이 달 마감을 요청하셨습니다.'
            : st === '진행중'
              ? '이 달 실적입니다. 아직 마감 요청 전이에요.'
              : '한 달 수업을 확인하고 제출하세요.'}
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
          <Stat label="총 회차" value={`${summary?.total_count ?? 0}건`} />
          <Stat label="결강" value={`${summary?.absent_count ?? 0}건`} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <Stat label="시수" value={`${((summary?.total_minutes ?? 0) / 60).toFixed(1)}h`} />
          <Stat label="보강" value={`${summary?.makeup_count ?? 0}건`} />
        </div>

        {st === '제출' && (
          <div
            style={{
              padding: '11px 13px',
              background: '#EDF7F1',
              borderRadius: 9,
              fontSize: 12.5,
              color: '#1F5B3A',
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            제출했습니다. 원장님 확인을 기다리는 중입니다.
          </div>
        )}
        {st === '반려' && (
          <div
            style={{
              padding: '11px 13px',
              background: '#FEF6E7',
              borderRadius: 9,
              fontSize: 12.5,
              color: '#8A5A00',
              marginBottom: 12,
              lineHeight: 1.6,
            }}
          >
            <b>반려됨</b>
            {closing?.reject_reason ? ` — ${closing.reject_reason}` : ''}
          </div>
        )}
        {st === '승인' && (
          <div
            style={{
              padding: '11px 13px',
              background: '#EDF7F1',
              borderRadius: 9,
              fontSize: 12.5,
              color: '#1F5B3A',
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            승인 완료. 이 달 출결은 더 이상 수정할 수 없습니다.
          </div>
        )}

        {(summary?.unmade_up ?? 0) > 0 && (
          <div
            style={{
              padding: '11px 13px',
              background: '#FEF6E7',
              borderRadius: 9,
              fontSize: 12.5,
              color: '#8A5A00',
              marginBottom: 12,
              lineHeight: 1.6,
            }}
          >
            보강이 아직 안 잡힌 결강이 {summary.unmade_up}건 있습니다.
          </div>
        )}

        <Btn
          variant="primary"
          disabled={done || busy}
          onClick={onSubmit}
          style={{ width: '100%', padding: '13px 0', fontSize: 15 }}
        >
          {st === '승인' ? '마감 완료' : st === '제출' ? '제출 완료' : '마감 제출하기'}
        </Btn>
      </Card>
    </div>
  )
}


/* ═════════════════ AdminViews.jsx ═════════════════ */

/* ---------------- 정산 ---------------- */
/* ================= 급여 기록 (마감 승인할 때 저장된 것) ================= */
function PayrollHistory({ rows, staffOrder = [], ownerName, toneOf, busy, onPaid }) {
  const rank = (n) => (n === ownerName ? -1 : staffOrder.indexOf(n) < 0 ? 99 : staffOrder.indexOf(n))
  const [openYm, setOpenYm] = useState(null)

  const months = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      if (!m[r.ym]) m[r.ym] = { ym: r.ym, list: [], total: 0, unpaid: 0 }
      m[r.ym].list.push(r)
      m[r.ym].total += r.pay || 0
      if (!r.paid_on) m[r.ym].unpaid += r.pay || 0
    })
    return Object.values(m)
      .map((g) => ({ ...g, list: g.list.sort((a, b) => rank(a.staff_name) - rank(b.staff_name)) }))
      .sort((a, b) => b.ym.localeCompare(a.ym))
  }, [rows, staffOrder, ownerName])

  const byStaffTotal = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      if (!m[r.staff_name]) m[r.staff_name] = 0
      m[r.staff_name] += r.pay || 0
    })
    return Object.entries(m).sort((a, b) => rank(a[0]) - rank(b[0]))
  }, [rows, staffOrder, ownerName])

  const grand = rows.reduce((a, b) => a + (b.pay || 0), 0)
  const unpaid = rows.filter((r) => !r.paid_on).reduce((a, b) => a + (b.pay || 0), 0)

  if (!rows.length)
    return (
      <Empty>
        아직 급여 기록이 없습니다. 마감을 <b>승인</b>하면 그 달 급여가 금액까지 여기에 저장됩니다.
      </Empty>
    )

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label={`기록된 급여 (${months.length}개월)`} value={`${won(grand)}원`} />
        <Stat label="아직 이체 안 함" value={`${won(unpaid)}원`} tone={unpaid > 0 ? C.danger : C.mut} />
      </div>

      <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.75, marginBottom: 12 }}>
        마감을 <b>승인</b>할 때 그 달 급여가 그대로 저장됩니다. 나중에 단가나 출결을 고쳐도 이 금액은 바뀌지 않아요.
        이체하신 뒤 <b>이체함</b>을 누르면 날짜가 남습니다.
      </div>

      {months.map((g) => (
        <Card key={g.ym} style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div
            style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              background: '#FBFBFC', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{g.ym.replace('-', '년 ')}월분</div>
            <span style={{ fontSize: 12, color: C.sub }}>{g.list.length}명</span>
            {g.unpaid > 0 ? (
              <Pill tone="pink">이체 전 {won(g.unpaid)}원</Pill>
            ) : (
              <Pill tone="green">이체 완료</Pill>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700 }}>{won(g.total)}원</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {g.list.map((r) => (
                <tr key={r.staff_id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <span style={{ color: toneOf ? toneOf(r.staff_name).fg : C.ink }}>{r.staff_name}</span>
                  </td>
                  <td style={{ padding: '9px 8px', color: C.sub, whiteSpace: 'nowrap' }}>
                    회차 {r.lesson_count}
                    {r.makeup_count > 0 && ` (보강 ${r.makeup_count})`}
                  </td>
                  <td style={{ padding: '9px 8px', color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    수강료 {won(r.tuition)}
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {won(r.pay)}원
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.paid_on ? (
                      <span style={{ fontSize: 12, color: '#1F5B3A' }}>{r.paid_on.slice(5).replace('-', '/')} 이체</span>
                    ) : (
                      <span style={{ fontSize: 12, color: C.mut }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.pay_now != null && r.pay_now !== r.pay && (
                      <span
                        title={`지금 다시 계산하면 ${won(r.pay_now)}원 (기록은 승인 당시 금액)`}
                        style={{
                          fontSize: 11, color: '#8A5A00', background: '#FEF6E7',
                          borderRadius: 99, padding: '2px 8px', marginRight: 7, whiteSpace: 'nowrap',
                        }}
                      >
                        지금 {won(r.pay_now)}
                      </span>
                    )}
                    <Btn
                      variant={r.paid_on ? 'default' : 'ok'}
                      disabled={busy}
                      onClick={() => onPaid(r.ym, r.staff_id, r.paid_on ? null : undefined)}
                      style={{ padding: '5px 11px', fontSize: 12 }}
                    >
                      {r.paid_on ? '이체 취소' : '이체함'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      <Card style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>선생님별 합계</div>
        {byStaffTotal.map(([n, v]) => (
          <div key={n} style={{ display: 'flex', fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: toneOf ? toneOf(n).fg : C.ink, fontWeight: 600 }}>{n}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{won(v)}원</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

function BillingView({ ym, lines, byStaff, payroll, receipts, onOpenReceipt, onPrintAll, onSetRate, onDetail, busy, closing, closings = [], onClose, staffOrder = [], ownerName, payHistory = [], onPayrollPaid, toneOf }) {
  // 이 달 마감한 선생님
  const closedSet = useMemo(() => new Set((closings || []).filter((c) => c.status === '승인').map((c) => c.staff_name)), [closings])
  // 정산 화면 선생님 순서: 원장님은 맨 위 고정, 나머지는 등록 순서 (금액과 상관없이 늘 같은 자리)
  const moneyOrder = (an, _aAmt, bn, _bAmt) => {
    if (an === ownerName && bn !== ownerName) return -1
    if (bn === ownerName && an !== ownerName) return 1
    const ia = staffOrder.indexOf(an), ib = staffOrder.indexOf(bn)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || an.localeCompare(bn, 'ko')
  }
  const [group, setGroup] = useState('staff')
  const [payTab, setPayTab] = useState('now')
  const receiptShown = useMemo(() => new Set(), [byStaff, group])
  const [detailFor, setDetailFor] = useState(null)
  const [detail, setDetail] = useState(null)

  const openDetail = async (r) => {
    setDetailFor(r)
    setDetail(null)
    try {
      setDetail(await onDetail(r.staff_id))
    } catch {
      setDetail([])
    }
  }
  const byStudent = useMemo(() => {
    const m = {}
    lines.forEach((l) => {
      if (!m[l.student_id])
        m[l.student_id] = { id: l.student_id, name: l.student_name, label: l.label || l.student_name, lines: [], subtotal: 0, unmade: 0 }
      m[l.student_id].lines.push(l)
      m[l.student_id].subtotal += l.amount
      m[l.student_id].unmade += l.unmade_up
    })
    return Object.values(m).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [lines])

  const staffGroups = useMemo(() => {
    const m = {}
    ;(byStaff || []).forEach((r) => {
      if (!m[r.staff_id])
        m[r.staff_id] = { id: r.staff_id, name: r.staff_name, rows: [], amount: 0, count: 0, minutes: 0, students: new Set() }
      const g = m[r.staff_id]
      g.rows.push(r)
      g.amount += r.amount
      g.count += r.lesson_count
      g.minutes += r.minutes
      g.students.add(r.student_id)
    })
    return Object.values(m)
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ko')) }))
      .sort((a, b) => moneyOrder(a.name, a.amount, b.name, b.amount))
  }, [byStaff, staffOrder, ownerName])

  // 인쇄 순서 = 화면에 보이는 순서 (선생님별 묶음 → 그 안에서 이름순, 아이는 한 번만)
  const printOrder = useMemo(() => {
    const seen = new Set()
    const out = []
    staffGroups.forEach((g) => {
      g.rows.forEach((r) => {
        if (seen.has(r.student_id)) return
        seen.add(r.student_id)
        const kid = byStudent.find((x) => x.id === r.student_id)
        if (kid) out.push(kid)
      })
    })
    byStudent.forEach((k) => {
      if (!seen.has(k.id)) out.push(k)
    })
    return out
  }, [staffGroups, byStudent])


  const rMap = useMemo(() => Object.fromEntries(receipts.map((r) => [r.student_id, r])), [receipts])
  const total = byStudent.reduce((a, b) => a + b.subtotal + (rMap[b.id]?.adjustment || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 정산</div>
        <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8 }}>
          {[['staff', '영수증'], ['payroll', '급여']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setGroup(k)}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 6,
                fontSize: 12.5, fontWeight: 600,
                background: group === k ? '#fff' : 'transparent',
                color: group === k ? C.ink : C.sub,
                boxShadow: group === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {true && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Btn onClick={() => onPrintAll(printOrder)} disabled={printOrder.length === 0}>
              영수증 {printOrder.length}장 인쇄
            </Btn>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.pkd }}>{won(total)}원</div>
          </div>
        )}
      </div>

      {group === 'payroll' ? (
        <div>
          <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8, width: 'fit-content', marginBottom: 12 }}>
            {[['now', '이 달'], ['hist', '기록']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPayTab(k)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '5px 14px', borderRadius: 6,
                  fontSize: 12.5, fontWeight: 600,
                  background: payTab === k ? '#fff' : 'transparent',
                  color: payTab === k ? C.ink : C.sub,
                  boxShadow: payTab === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {payTab === 'hist' ? (
            <PayrollHistory
              rows={payHistory}
              staffOrder={staffOrder}
              ownerName={ownerName}
              toneOf={toneOf}
              busy={busy}
              onPaid={onPayrollPaid}
            />
          ) : (
        <div>
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.75, marginBottom: 12 }}>
            급여 = <b>(진행 + 보강)</b> 회차의 수강료 합계 × 선생님 비율. 결강은 보강해야 집계됩니다.
            보강은 <b>보강한 달</b>에 잡혀요.
            <br />
            수강료 청구는 (진행 + 결강) 기준이라 아래 <b>수강료</b> 금액과 정산 탭의 금액이 다를 수 있습니다.
          </div>
          <Card style={{ overflow: 'auto', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 660 }}>
              <thead>
                <tr style={{ background: '#FBFBFC', color: C.sub }}>
                  {['선생님', '비율', '회차', '보강', '시수', '수강료', '급여', '미보강', ''].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '9px 12px',
                        textAlign: i >= 2 && i <= 7 ? 'right' : 'left',
                        fontWeight: 600,
                        borderBottom: `1px solid ${C.line}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(payroll || []).length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <Empty>이 달 수업 기록이 없습니다.</Empty>
                    </td>
                  </tr>
                )}
                {[...(payroll || [])].sort((a, b) => moneyOrder(a.staff_name, a.pay ?? a.tuition, b.staff_name, b.pay ?? b.tuition)).map((r) => (
                  <tr key={r.staff_id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{r.staff_name}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        placeholder="—"
                        defaultValue={r.pay_rate != null ? Math.round(r.pay_rate * 100) : ''}
                        onBlur={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value) / 100
                          const cur = r.pay_rate != null ? Number(r.pay_rate) : null
                          if (v !== cur) onSetRate(r.staff_id, v)
                        }}
                        style={{ width: 56, fontSize: 13, padding: '5px 7px', border: '1px solid #DEE0E3', borderRadius: 6, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 12, color: C.sub, marginLeft: 3 }}>%</span>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r.lesson_count}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: r.makeup_count ? '#254B8C' : '#C9CCD1' }}>
                      {r.makeup_count || '—'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: C.sub }}>
                      {(r.minutes / 60).toFixed(1)}h
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: C.sub }}>{won(r.tuition)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: r.pay != null ? C.pkd : C.mut }}>
                      {r.pay != null ? `${won(r.pay)}원` : '비율 없음'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: r.unmade_up ? C.danger : '#C9CCD1', fontWeight: r.unmade_up ? 700 : 400 }}>
                      {r.unmade_up || '—'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {closedSet.has(r.staff_name) ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Pill tone="green">마감함</Pill>
                          <Btn
                            disabled={busy}
                            onClick={() => onClose(r.staff_id, true)}
                            style={{ padding: '4px 9px', fontSize: 11.5, color: C.sub }}
                          >
                            취소
                          </Btn>
                        </span>
                      ) : (
                        <Btn
                          variant="primary"
                          disabled={busy}
                          onClick={() => onClose(r.staff_id, false)}
                          style={{ padding: '5px 11px', fontSize: 12 }}
                        >
                          마감하기
                        </Btn>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      <Btn disabled={busy} onClick={() => openDetail(r)} style={{ padding: '5px 11px', fontSize: 12 }}>
                        내역
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
              {(payroll || []).length > 0 && (
                <tfoot>
                  <tr style={{ background: C.pkl, fontWeight: 700 }}>
                    <td style={{ padding: '10px 12px' }}>합계</td>
                    <td />
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {payroll.reduce((a, b) => a + b.lesson_count, 0)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {payroll.reduce((a, b) => a + b.makeup_count, 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {(payroll.reduce((a, b) => a + b.minutes, 0) / 60).toFixed(1)}h
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {won(payroll.reduce((a, b) => a + b.tuition, 0))}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: C.pkd }}>
                      {won(payroll.reduce((a, b) => a + (b.pay || 0), 0))}원
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
          <div style={{ fontSize: 12, color: C.sub }}>
            비율 칸에 숫자를 넣고 다른 곳을 누르면 저장됩니다. 60이면 60%예요.
          </div>

          {detailFor && (
            <Modal onClose={() => setDetailFor(null)} max={420}>
              <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{detailFor.staff_name} 급여 내역</div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
                  {ym.replace('-', '년 ')}월 · 수강료 {won(detailFor.tuition)}원 ×{' '}
                  {detailFor.pay_rate != null ? `${Math.round(detailFor.pay_rate * 100)}%` : '비율 미설정'}
                  {detailFor.pay != null && ` = ${won(detailFor.pay)}원`}
                </div>
              </div>
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {detail === null ? (
                  <Empty>불러오는 중…</Empty>
                ) : detail.length === 0 ? (
                  <Empty>내역이 없습니다.</Empty>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: C.mut, fontSize: 11.5 }}>
                        <th style={{ textAlign: 'left', padding: '8px 16px', fontWeight: 600 }}>아동</th>
                        <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 600 }}>회차</th>
                        <th style={{ textAlign: 'right', padding: '8px 16px', fontWeight: 600 }}>수강료</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.map((d, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.line2}` }}>
                          <td style={{ padding: '8px 16px' }}>
                            {d.student_name}
                            <div style={{ fontSize: 11, color: C.mut }}>
                              {d.program_label}
                              {d.makeup_count > 0 && ` · 보강 ${d.makeup_count}`}
                            </div>
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                            {d.lesson_count}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>
                            {won(d.tuition)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={{ padding: 16 }}>
                <Btn onClick={() => setDetailFor(null)} style={{ width: '100%', padding: '11px 0' }}>
                  닫기
                </Btn>
              </div>
            </Modal>
          )}
        </div>
          )}
        </div>
      ) : group === 'staff' ? (
        <div>
          {(() => { receiptShown.clear(); return null })()}
          {staffGroups.map((g) => (
            <Card key={g.id} style={{ marginBottom: 12, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '11px 16px',
                  background: '#FBFBFC',
                  borderBottom: `1px solid ${C.line}`,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: C.sub }}>
                  아동 {g.students.size}명 · {g.count}회
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: C.pkd }}>
                  {won(g.amount)}원
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {g.rows.map((r, i) => {
                    const kid = byStudent.find((x) => x.id === r.student_id)
                    const rc = receipts.find((x) => x.student_id === r.student_id)
                    const first = !receiptShown.has(r.student_id)
                    if (first) receiptShown.add(r.student_id)
                    return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.line2}` }}>
                      <td style={{ padding: '8px 16px', fontWeight: 600, width: '20%' }}>{r.student_name}</td>
                      <td style={{ padding: '8px 8px', color: '#4B5057' }}>{r.program_label}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', width: '13%' }}>{r.lesson_count}회</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, width: '20%' }}>
                        {won(r.amount)}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', width: '17%' }}>
                        {kid && first && (
                          <Btn
                            onClick={() => onOpenReceipt(kid)}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                          >
                            {rc?.locked ? '영수증 ✓' : '영수증'}
                          </Btn>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </Card>
          ))}
          {staffGroups.length === 0 && (
            <Card>
              <Empty>이 달 수업 기록이 없습니다. 먼저 회차를 생성하세요.</Empty>
            </Card>
          )}
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
            아동이 두 선생님께 배우면 회차 단위로 나뉩니다. 선생님별 합계를 모두 더하면 아동별 총액과 같습니다.
          </div>
        </div>
      ) : null}
      {group === 'student' && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.sub }}>
          아동 이름을 누르면 영수증이 열립니다.
        </div>
      )}
    </div>
  )
}

/* ---------------- 영수증 ---------------- */
function ReceiptModal({ ym, student, receipt, extra, onClose, onIssue, onUnlock, onSaveAdjust, busy }) {
  const [amount, setAmount] = useState(receipt?.adjustment || 0)
  const [reason, setReason] = useState(receipt?.adjust_reason || '')
  const locked = !!receipt?.locked
  const R = receiptShow(student.subtotal, Number(amount) || 0, extra)
  const partial = R.used > 0 && !R.full
  const showDue = R.carry < 0 || partial
  const total = showDue ? R.due : R.net
  const hasAbsent = student.lines.some((l) => (l.absent_dates || []).length > 0)

  return (
    <Modal onClose={onClose} max={430}>
      <div style={{ padding: '24px 26px 18px', textAlign: 'center', borderBottom: `2px solid ${C.pk}` }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.06em', color: C.pkd }}>
          수강료 영수증
        </div>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 5 }}>{ym.replace('-', '년 ')}월</div>
      </div>

      <div style={{ padding: '18px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{student.label || student.name}</div>
          <div style={{ fontSize: 12, color: C.mut }}>귀하</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: C.mut, fontSize: 11.5 }}>
              <th style={{ textAlign: 'left', padding: '0 0 6px', fontWeight: 600 }}>수업명</th>
              <th style={{ textAlign: 'right', padding: '0 0 6px', fontWeight: 600 }}>횟수</th>
              <th style={{ textAlign: 'right', padding: '0 0 6px', fontWeight: 600 }}>단가</th>
              <th style={{ textAlign: 'right', padding: '0 0 6px', fontWeight: 600 }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {student.lines.map((l, i) => {
              const absent = new Set((l.absent_dates || []).map((d) => d.slice(-2)))
              return (
                <tr key={i} style={{ borderTop: `1px solid ${C.line2}` }}>
                  <td style={{ padding: '9px 0' }}>
                    {l.program_label}
                    <div style={{ fontSize: 11, color: C.mut }}>
                      {teacherLabel(l.staff_summary)}
                    </div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.55 }}>
                      {(l.session_dates || []).map((d, k) => {
                        const dd = d.slice(-2)
                        const isAbsent = absent.has(dd)
                        return (
                          <span key={k} style={{ marginRight: 5, color: isAbsent ? C.danger : C.sub }}>
                            {Number(dd)}
                            {isAbsent ? '*' : ''}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '9px 0', textAlign: 'right', verticalAlign: 'top' }}>{l.lesson_count}</td>
                  <td style={{ padding: '9px 0', textAlign: 'right', color: C.sub, verticalAlign: 'top' }}>
                    {won(l.unit_price)}
                  </td>
                  <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>
                    {won(l.amount)}
                  </td>
                </tr>
              )
            })}
            {Number(amount) !== 0 && (
              <tr style={{ borderTop: `1px solid ${C.line2}` }}>
                <td colSpan={3} style={{ padding: '9px 0', color: C.danger }}>
                  조정
                  <div style={{ fontSize: 11, color: C.mut }}>{reason || '사유 없음'}</div>
                </td>
                <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 600, color: C.danger }}>
                  {won(Number(amount))}
                </td>
              </tr>
            )}
            {R.carry < 0 && (
              <tr style={{ borderTop: `1px solid ${C.line2}` }}>
                <td colSpan={3} style={{ padding: '9px 0', color: C.danger }}>{R.note || '지난 취소분'}</td>
                <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 600, color: C.danger }}>{won(R.carry)}</td>
              </tr>
            )}
            {partial && (
              <tr style={{ borderTop: `1px solid ${C.line2}` }}>
                <td colSpan={3} style={{ padding: '9px 0', color: '#1F5B3A' }}>선입금 사용</td>
                <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 600, color: '#1F5B3A' }}>{won(-R.used)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1.5px solid ${C.ink}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>{showDue ? '이번에 내실 금액' : '합계'}</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.pkd }}>{won(total)}원</div>
        </div>
        {R.full && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#1F5B3A', background: '#EDF7F1', borderRadius: 5, padding: '3px 9px' }}>
              선입금에서 결제됨{R.left > 0 && ` · 남은 선입금 ${won(R.left)}원`}{R.months > 0 && ` (${R.months}개월분)`}
            </span>
          </div>
        )}

        {hasAbsent && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.sub, lineHeight: 1.6 }}>
            * 표시는 결강일입니다. 월정액이라 청구에 포함되며 보강해 드립니다.
          </div>
        )}
        {student.unmade > 0 && (
          <div
            className="no-print"
            style={{
              marginTop: 10,
              padding: '9px 12px',
              background: '#FDECEF',
              borderRadius: 8,
              fontSize: 12,
              color: C.danger,
              fontWeight: 600,
            }}
          >
            아직 보강하지 않은 수업 {student.unmade}회가 있습니다
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12.5, color: '#4B5057', lineHeight: 1.9 }}>
          위 금액을 정히 영수합니다.
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 5, color: C.ink }}>
            검단ABA언어행동연구소
          </div>
          <div style={{ fontSize: 11, color: C.mut }}>인천 검단구 이음1로 377 눈담봄 905호</div>
          <div style={{ fontWeight: 700, marginTop: 2, color: C.ink }}>대표 민다혜 (인)</div>
        </div>

        <div
          className="no-print"
          style={{ marginTop: 18, padding: 13, background: '#FAFAFB', borderRadius: 9, border: `1px solid #EFF0F2` }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#4B5057' }}>
            예외 감액 (여행 등)
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              type="number"
              placeholder="-160000"
              disabled={locked}
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              style={{ width: 108, fontSize: 13, padding: '7px 9px', border: '1px solid #DEE0E3', borderRadius: 7 }}
            />
            <input
              placeholder="사유를 꼭 적으세요"
              disabled={locked}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '7px 9px', border: '1px solid #DEE0E3', borderRadius: 7 }}
            />
          </div>
          {locked && (
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 7 }}>
              발행 완료된 영수증입니다. 고치려면 잠금을 해제하세요.
            </div>
          )}
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
          {locked ? (
            <Btn variant="danger" disabled={busy} onClick={() => onUnlock(student.id)} style={{ flex: 1 }}>
              잠금 해제
            </Btn>
          ) : (
            <Btn
              variant="primary"
              disabled={busy}
              onClick={() => onIssue(student.id, Number(amount) || 0, reason)}
              style={{ flex: 1 }}
            >
              발행하고 잠그기
            </Btn>
          )}
          <Btn disabled={busy} onClick={() => window.print()} style={{ flex: 1 }}>
            인쇄 / PDF
          </Btn>
          <Btn onClick={onClose} style={{ flex: 1 }}>
            닫기
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- 마감 ---------------- */
function ClosingView({ ym, rows, staff, onRequest, onReview, onPrevYm, onNextYm, busy, embedded }) {
  const [copied, setCopied] = useState(false)
  const map = Object.fromEntries(rows.map((r) => [r.staff_name, r]))

  const copyMsg = () => {
    const lines = staff
      .filter((s) => s.active)
      .map((s) => {
        const r = map[s.name]
        return `· ${s.name} 선생님 — ${r?.total_count ?? 0}회 · 결강 ${r?.absent_count ?? 0}`
      })
    const msg = `[검단ABA] ${ym.replace('-', '년 ')}월 마감 요청\n\n출결 확인 부탁드립니다.\n앱 > 마감 탭에서 제출해 주세요.\n\n${lines.join('\n')}\n\n확인 안 된 수업이 있으면 제출이 안 됩니다.`
    navigator.clipboard?.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {!embedded && (
          <>
            <Btn onClick={onPrevYm} style={{ padding: '6px 11px' }}>←</Btn>
            <div style={{ fontSize: 15, fontWeight: 700, minWidth: 96, textAlign: 'center' }}>
              {ym.replace('-', '년 ')}월 마감
            </div>
            <Btn onClick={onNextYm} style={{ padding: '6px 11px' }}>→</Btn>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <Btn disabled={busy} onClick={() => onRequest(null)}>
            전원 마감 대상으로
          </Btn>
          <Btn variant="primary" onClick={copyMsg}>
            {copied ? '복사됨 — 단톡방에 붙여넣으세요' : '단톡방 문구 복사'}
          </Btn>
        </div>
      </div>

      <Card style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ background: '#FBFBFC', color: C.sub }}>
              {['선생님', '상태', '회차', '결강', '시수', '미보강', ''].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '9px 12px',
                    textAlign: i >= 2 && i <= 5 ? 'right' : 'left',
                    fontWeight: 600,
                    borderBottom: `1px solid ${C.line}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff
              .filter((s) => s.active)
              .map((s, idx) => {
                const r = map[s.name]
                const st = r?.status || '—'
                const tone =
                  st === '제출' ? 'blue' : st === '승인' ? 'green' : st === '반려' ? 'amber' : 'gray'
                const label = st === '요청' ? '대상' : st
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{s.name}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <Pill tone={tone}>{label}</Pill>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r?.total_count ?? '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r?.absent_count ?? '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      {r?.total_minutes != null ? `${(r.total_minutes / 60).toFixed(1)}h` : '—'}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        color: r?.unmade_up ? C.danger : '#C9CCD1',
                        fontWeight: r?.unmade_up ? 700 : 400,
                      }}
                    >
                      {r?.unmade_up || '—'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {st === '제출' ? (
                        <>
                          <Btn
                            variant="ok"
                            disabled={busy}
                            onClick={() => onReview(s.id, true)}
                            style={{ padding: '5px 11px', fontSize: 12, marginRight: 5 }}
                          >
                            승인
                          </Btn>
                          <Btn
                            disabled={busy}
                            onClick={() => {
                              const why = prompt('반려 사유를 적어주세요')
                              if (why) onReview(s.id, false, why)
                            }}
                            style={{ padding: '5px 11px', fontSize: 12 }}
                          >
                            반려
                          </Btn>
                        </>
                      ) : st === '승인' ? (
                        <Btn
                          disabled={busy}
                          onClick={() => onReview(s.id, false, '재확인 필요')}
                          style={{ padding: '5px 11px', fontSize: 12 }}
                        >
                          잠금 해제
                        </Btn>
                      ) : (
                        <Btn disabled={busy} onClick={() => onRequest(s.id)} style={{ padding: '5px 11px', fontSize: 12 }}>
                          대상으로
                        </Btn>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </Card>
      <div style={{ marginTop: 10, fontSize: 12, color: C.sub, lineHeight: 1.75 }}>
        <b style={{ color: C.danger }}>앱이 선생님께 알림을 보내지는 않습니다.</b> 위 <b>단톡방 문구 복사</b>를
        눌러 단톡방에 붙여넣으셔야 선생님이 알 수 있어요.
        <br />
        <b>대상으로</b>는 이 달을 마감할 선생님으로 표시만 하는 것입니다. 선생님이 앱에 들어오면 "마감을
        요청하셨습니다"라고 보입니다.
        <br />
        승인하면 그 선생님의 해당 월 출결이 잠깁니다. 뒤늦게 고칠 일이 생기면 잠금을 해제하세요.
      </div>
    </div>
  )
}


/* ═════════════════ ManageViews.jsx ═════════════════ */

const DOW = ['일', '월', '화', '수', '목', '금', '토']

const thisMonthFirst = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const nextMonthFirst = () => {
  const d = new Date()
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`
}

/* ================= 휴원일 ================= */
// 2026~2030 공휴일 (대체공휴일 제외 · 일요일 제외 — 일요일은 원래 수업이 없음)
//   노동절·제헌절은 2026-05-11 시행 개정으로 법정 공휴일이 됐습니다.
const PUBLIC_HOLIDAYS = [
  ['2026-01-01', '신정'],
  ['2026-02-16', '설날 연휴'],
  ['2026-02-17', '설날'],
  ['2026-02-18', '설날 연휴'],
  ['2026-05-01', '노동절'],
  ['2026-05-05', '어린이날'],
  ['2026-06-03', '지방선거'],
  ['2026-06-06', '현충일'],
  ['2026-07-17', '제헌절'],
  ['2026-08-15', '광복절'],
  ['2026-09-24', '추석 연휴'],
  ['2026-09-25', '추석'],
  ['2026-09-26', '추석 연휴'],
  ['2026-10-03', '개천절'],
  ['2026-10-09', '한글날'],
  ['2026-12-25', '크리스마스'],

  ['2027-01-01', '신정'],
  ['2027-02-06', '설날 연휴'],
  ['2027-02-08', '설날 연휴'],
  ['2027-03-01', '삼일절'],
  ['2027-05-01', '노동절'],
  ['2027-05-05', '어린이날'],
  ['2027-05-13', '부처님오신날'],
  ['2027-07-17', '제헌절'],
  ['2027-09-14', '추석 연휴'],
  ['2027-09-15', '추석'],
  ['2027-09-16', '추석 연휴'],
  ['2027-10-09', '한글날'],
  ['2027-12-25', '크리스마스'],

  ['2028-01-01', '신정'],
  ['2028-01-26', '설날 연휴'],
  ['2028-01-27', '설날'],
  ['2028-01-28', '설날 연휴'],
  ['2028-03-01', '삼일절'],
  ['2028-04-12', '국회의원 선거'],
  ['2028-05-01', '노동절'],
  ['2028-05-02', '부처님오신날'],
  ['2028-05-05', '어린이날'],
  ['2028-06-06', '현충일'],
  ['2028-07-17', '제헌절'],
  ['2028-08-15', '광복절'],
  ['2028-10-02', '추석 연휴'],
  ['2028-10-03', '추석'],
  ['2028-10-04', '추석 연휴'],
  ['2028-10-09', '한글날'],
  ['2028-12-25', '크리스마스'],

  ['2029-01-01', '신정'],
  ['2029-02-12', '설날 연휴'],
  ['2029-02-13', '설날'],
  ['2029-02-14', '설날 연휴'],
  ['2029-03-01', '삼일절'],
  ['2029-05-01', '노동절'],
  ['2029-05-05', '어린이날'],
  ['2029-06-06', '현충일'],
  ['2029-07-17', '제헌절'],
  ['2029-08-15', '광복절'],
  ['2029-09-21', '추석 연휴'],
  ['2029-09-22', '추석'],
  ['2029-10-03', '개천절'],
  ['2029-10-09', '한글날'],
  ['2029-12-25', '크리스마스'],

  ['2030-01-01', '신정'],
  ['2030-02-02', '설날 연휴'],
  ['2030-02-04', '설날 연휴'],
  ['2030-03-01', '삼일절'],
  ['2030-05-01', '노동절'],
  ['2030-05-09', '부처님오신날'],
  ['2030-06-06', '현충일'],
  ['2030-07-17', '제헌절'],
  ['2030-08-15', '광복절'],
  ['2030-09-11', '추석 연휴'],
  ['2030-09-12', '추석'],
  ['2030-09-13', '추석 연휴'],
  ['2030-10-03', '개천절'],
  ['2030-10-09', '한글날'],
  ['2030-12-25', '크리스마스'],
]

// 아동 등록·수정 창 입력칸 모양
const inp = {
  width: '100%',
  fontSize: 14,
  padding: '10px 11px',
  border: '1px solid #DEE0E3',
  borderRadius: 8,
  background: '#fff',
}

function StudentModal({ student, staff, onClose, onSave, onRemove, busy }) {
  const [name, setName] = useState(student?.name || '')
  const [display, setDisplay] = useState(student?.display_name || '')
  const [main, setMain] = useState(student?.main_staff_id || staff[0]?.id || '')
  const [status, setStatus] = useState(student?.status || '재원')
  // 퇴소·휴원 시작일 — 기본값은 다음 달 1일
  const [from, setFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear() + (d.getMonth() === 11 ? 1 : 0)}-${String(((d.getMonth() + 1) % 12) + 1).padStart(2, '0')}-01`
  })

  return (
    <Modal onClose={onClose} max={370}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}`, fontSize: 17, fontWeight: 700 }}>
        {student ? '아동 수정' : '새 아동 등록'}
      </div>
      <div style={{ padding: 18 }}>
        <Field label="이름">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="김지환" />
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 5, lineHeight: 1.55 }}>
            같은 이름의 아동이 이미 다니고 있으면 뒤에 구분을 붙여주세요 (예: 김지환B). 영수증에는 아래
            표기명이 나가니 거기에는 이름만 적으시면 됩니다.
          </div>
        </Field>
        <Field label="영수증 표기명 (비우면 이름 그대로)">
          <input value={display} onChange={(e) => setDisplay(e.target.value)} style={inp} placeholder="김 지 환" />
        </Field>
        <Field label="담당 선생님">
          <select value={main} onChange={(e) => setMain(e.target.value)} style={inp}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="상태">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
            {['재원', '휴원', '퇴소'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        {status !== '재원' && student && (
          <Field label={`${status} 시작일 — 이 날부터 수업이 없어집니다`}>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={inp}
            />
            <div style={{ fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 1.6 }}>
              이 날부터의 시간표와 회차만 정리하고, <b>그 전 기록(회차·청구·영수증)은 그대로</b> 둡니다.
              출결을 찍었거나 영수증이 발행된 회차는 지우지 않습니다.
            </div>
          </Field>
        )}
        {status !== '재원' && !student && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>
            재원이 아니면 회차가 만들어지지 않습니다.
          </div>
        )}
        {student && onRemove && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line2}` }}>
            <Btn
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `${student.name} 아동을 완전히 삭제할까요?\n\n` +
                      `수업 기록이 없으면 지워지고, 기록이 있으면 퇴소 처리됩니다.\n` +
                      `그만 다니는 경우라면 위 상태를 퇴소로 바꾸는 편이 낫습니다.`
                  )
                )
                  onRemove(student.id)
              }}
              style={{ padding: '7px 13px', fontSize: 12.5, color: C.danger, borderColor: '#F3AFBD' }}
            >
              아동 삭제
            </Btn>
            <span style={{ fontSize: 11.5, color: C.mut, marginLeft: 9 }}>잘못 등록했을 때만 쓰세요</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
          <Btn
            variant="primary"
            disabled={!name.trim() || busy}
            onClick={() =>
              onSave(
                { name: name.trim(), display_name: display.trim() || null, main_staff_id: main, status },
                student && status !== '재원' && status !== student.status ? from : null
              )
            }
            style={{ flex: 1, padding: '11px 0' }}
          >
            저장
          </Btn>
          <Btn onClick={onClose} style={{ flex: 1, padding: '11px 0' }}>
            취소
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}


/* ═════════════════ PlanView.jsx ═════════════════ */

const PLAN_DOW = ['일', '월', '화', '수', '목', '금', '토']

// 그 달에만 있는 일 — 휴무일과 외부 일정
function MonthOnlyCard({ ym, leaves, outside, staff, busy, onAddLeave, onRemoveLeave, onAddOutside, onRemoveOutside }) {
  const [open, setOpen] = useState(null) // 'leave' | 'out' | null
  const [d, setD] = useState('')
  const [label, setLabel] = useState('')
  const [staffId, setStaffId] = useState('')
  const [mode, setMode] = useState('취소')
  const [st, setSt] = useState('14:00')
  const [en, setEn] = useState('16:00')
  const [memo, setMemo] = useState('')

  const rows = [
    ...leaves.map((h) => ({ kind: 'leave', ...h })),
    ...outside.map((e) => ({ kind: 'out', ...e })),
  ].sort((a, b) => a.d.localeCompare(b.d) || (a.start_time || '').localeCompare(b.start_time || ''))

  const reset = () => {
    setD('')
    setLabel('')
    setMemo('')
    setOpen(null)
  }

  return (
    <Card style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '12px 15px', borderBottom: rows.length ? `1px solid ${C.line2}` : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>이 달에만 있는 일</div>
          <div style={{ fontSize: 12, color: C.sub }}>쉬는 날과 외부 일정입니다. 매주 반복되지 않습니다.</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Btn
              variant={open === 'leave' ? 'primary' : 'default'}
              onClick={() => setOpen(open === 'leave' ? null : 'leave')}
              style={{ padding: '6px 12px', fontSize: 12.5 }}
            >
              + 휴무일
            </Btn>
            <Btn
              variant={open === 'out' ? 'primary' : 'default'}
              onClick={() => setOpen(open === 'out' ? null : 'out')}
              style={{ padding: '6px 12px', fontSize: 12.5 }}
            >
              + 외부 일정
            </Btn>
          </div>
        </div>

        {open === 'leave' && (
          <div style={{ marginTop: 11, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12, color: C.sub }}>
              날짜
              <input type="date" value={d} min={ym + '-01'} onChange={(e) => setD(e.target.value)} style={{ ...planSel, width: 150, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.sub, flex: 1, minWidth: 140 }}>
              이름
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="센터 휴무" style={{ ...planSel, width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.sub }}>
              누구
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...planSel, width: 128, marginTop: 4 }}>
                <option value="">센터 전체</option>
                {staff.filter((x) => x.active).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: C.sub }}>
              그날 수업은
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...planSel, width: 112, marginTop: 4 }}>
                <option value="취소">취소</option>
                <option value="결강">결강</option>
                <option value="유지">그대로</option>
              </select>
            </label>
            <Btn
              variant="primary"
              disabled={busy || !d || !label.trim()}
              onClick={() => {
                onAddLeave({ d, label: label.trim(), staffId: staffId || null, mode })
                reset()
              }}
              style={{ padding: '9px 16px' }}
            >
              등록
            </Btn>
          </div>
        )}

        {open === 'out' && (
          <div style={{ marginTop: 11, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12, color: C.sub }}>
              날짜
              <input type="date" value={d} min={ym + '-01'} onChange={(e) => setD(e.target.value)} style={{ ...planSel, width: 150, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.sub }}>
              시작
              <input type="time" step={300} value={st} onChange={(e) => setSt(e.target.value)} style={{ ...planSel, width: 116, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.sub }}>
              종료
              <input type="time" step={300} value={en} onChange={(e) => setEn(e.target.value)} style={{ ...planSel, width: 116, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.sub, flex: 1, minWidth: 150 }}>
              일정 이름
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="서희학교 PBS 자문" style={{ ...planSel, width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.sub, flex: 1, minWidth: 120 }}>
              메모 (선택)
              <input value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...planSel, width: '100%', marginTop: 4 }} />
            </label>
            <Btn
              variant="primary"
              disabled={busy || !d || !label.trim()}
              onClick={() => {
                onAddOutside({ d, start_time: st, end_time: en, label: label.trim(), memo: memo.trim() })
                reset()
              }}
              style={{ padding: '9px 16px' }}
            >
              등록
            </Btn>
          </div>
        )}
      </div>

      {rows.map((r, i) => (
        <div
          key={r.kind + r.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line2}`, flexWrap: 'wrap',
          }}
        >
          <Pill tone={r.kind === 'leave' ? 'pink' : 'gray'}>{r.kind === 'leave' ? '휴무' : '외부'}</Pill>
          <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 100 }}>
            {r.d.slice(5)} ({r.weekday})
          </div>
          {r.kind === 'out' && (
            <div style={{ fontSize: 12.5, color: C.sub, minWidth: 92 }}>
              {hhmm(r.start_time)}~{hhmm(r.end_time)}
            </div>
          )}
          <div style={{ flex: 1, fontSize: 13.5, minWidth: 110 }}>
            {r.label}
            {r.kind === 'leave' && r.staff_name && (
              <span style={{ fontSize: 12, color: C.mut, marginLeft: 7 }}>· {r.staff_name}</span>
            )}
            {r.kind === 'out' && r.memo && (
              <span style={{ fontSize: 12, color: C.mut, marginLeft: 7 }}>· {r.memo}</span>
            )}
          </div>
          <Btn
            disabled={busy}
            onClick={() => {
              if (!confirm(`${r.d} ${r.label} 을(를) 삭제할까요?`)) return
              r.kind === 'leave' ? onRemoveLeave(r.id) : onRemoveOutside(r.id)
            }}
            style={{ padding: '5px 11px', fontSize: 12, color: C.danger }}
          >
            삭제
          </Btn>
        </div>
      ))}

      {rows.length === 0 && (
        <div style={{ padding: '14px 15px', fontSize: 12.5, color: C.mut }}>
          이 달에 등록된 휴무일이나 외부 일정이 없습니다.
        </div>
      )}
    </Card>
  )
}

const key = (r) => `${r.student_id}|${r.staff_id}|${r.program_code}|${r.weekday}|${r.start_time}`

function PlanView({
  ym, students, staff, programs, busy, onLoadPlan, onLoadLocked, onApply,
  onLoadBackups, onRestore, onCheck, say,
  leaves = [], outside = [], onAddLeave, onRemoveLeave, onAddOutside, onRemoveOutside,
  toneOf, onEditStudent, onNewStudent,
}) {
  const [rows, setRows] = useState(null)
  const [base, setBase] = useState(null)
  const [locked, setLocked] = useState(0)
  const [loading, setLoading] = useState(true)
  const [backups, setBackups] = useState(null)
  const [clash, setClash] = useState([])

  const prev = shiftYm(ym, -1)
  const [from, setFrom] = useState(ym)

  // 이 달 마지막 날 (날짜 칸을 이 달 안에서만 고르게)
  const monthEnd = useMemo(() => {
    const [yy, mm] = ym.split('-').map(Number)
    return `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
  }, [ym])

  useEffect(() => {
    let alive = true
    setLoading(true)
    // 그 달 시간표가 있으면 그걸, 없으면 지난달 것을 가져옵니다
    onLoadPlan(ym)
      .then(async (own) => {
        if (own && own.length) return [own, ym]
        const before = await onLoadPlan(prev)
        return [before, prev]
      })
      .then(async ([plan, src]) => {
        const lk = await onLoadLocked(ym)
        if (alive) setFrom(src)
        return [plan, lk]
      })
      .then(([plan, lk]) => {
        if (!alive) return
        const mStart = ym + '-01'
        const [yy, mm] = ym.split('-').map(Number)
        const mEnd = `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
        const mapped = plan
          // 지난달 시간표를 가져올 때, 지난달 안에 이미 끝난 수업은 빼고
          .filter((p) => !p.valid_to || p.valid_to >= mStart)
          .map((p, i) => ({
            uid: 'r' + i,
            student_id: p.student_id,
            staff_id: p.staff_id,
            program_code: p.program_code,
            weekday: p.weekday,
            start_time: hhmm(p.start_time),
            // 이 달 중간에 시작/끝나는 수업이면 그 날짜를 그대로 둡니다
            from: p.valid_from && p.valid_from > mStart && p.valid_from <= mEnd ? p.valid_from : '',
            to: p.valid_to && p.valid_to < mEnd && p.valid_to >= mStart ? p.valid_to : '',
            removed: false,
          }))
        setRows(mapped)
        setBase(new Set(mapped.map(key)))
        setLocked(lk || 0)
      })
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [ym])

  // 줄을 하나라도 고치면 빨간 표시를 지웁니다
  useEffect(() => {
    setClash((c) => (c.length ? [] : c))
  }, [rows])

  const monthLeaves = useMemo(
    () => leaves.filter((h) => h.d.slice(0, 7) === ym).sort((a, b) => a.d.localeCompare(b.d)),
    [leaves, ym]
  )
  const monthOutside = useMemo(
    () => outside.filter((e) => e.d.slice(0, 7) === ym).sort((a, b) => a.d.localeCompare(b.d)),
    [outside, ym]
  )

  // 선생님별로 묶어서 보여줍니다.
  //   수업 단위로 나눠서, 두 선생님께 배우는 아이는 양쪽 묶음에 모두 나오고
  //   각 묶음에는 그 선생님 수업만 보입니다.
  //   수업이 하나도 없는 아이(새로 등록 등)는 담당 선생님 묶음에 나옵니다.
  const byStaff = useMemo(() => {
    if (!rows) return []
    const kids = students.filter((s) => s.status === '재원')   // 퇴소·휴원은 아래 '그만둔 아동'에만
    const groups = staff
      .filter((x) => x.active)
      .map((x) => ({
        id: x.id,
        name: x.name,
        kids: kids
          .map((k) => {
            const mine = rows.filter((r) => r.student_id === k.id && r.staff_id === x.id)
            const hasAny = rows.some((r) => r.student_id === k.id)
            if (mine.length) return { ...k, items: mine, shared: rows.some((r) => r.student_id === k.id && r.staff_id !== x.id && !r.removed) }
            if (!hasAny && k.main_staff_id === x.id) return { ...k, items: [], shared: false }
            return null
          })
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      }))
    const shown = new Set(groups.flatMap((g) => g.kids.map((k) => k.id)))
    const rest = kids
      .filter((k) => !shown.has(k.id))
      .map((k) => ({ ...k, items: rows.filter((r) => r.student_id === k.id), shared: false }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    if (rest.length) groups.push({ id: 'etc', name: '담당 미지정', kids: rest })
    // 그만둔(퇴소·휴원) 아동 — 되돌리거나 고칠 수 있게 맨 아래에 따로
    const gone = students
      .filter((s) => s.status === '퇴소' || s.status === '휴원')
      .map((k) => ({ ...k, items: [], shared: false, gone: true }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    const out = groups.filter((g) => g.kids.length)
    if (gone.length) out.push({ id: 'gone', name: '그만둔 아동', kids: gone, gone: true })
    return out
  }, [rows, students, staff])

  const stat = useMemo(() => {
    if (!rows || !base) return { changed: 0, live: 0 }
    const live = rows.filter((r) => !r.removed)
    const changed =
      live.filter((r) => !base.has(key(r))).length + rows.filter((r) => r.removed).length
    return { changed, live: live.length }
  }, [rows, base])

  const set = (uid, patch) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))

  const addRow = (sid, staffId) =>
    setRows((rs) => [
      ...rs,
      {
        uid: 'n' + Date.now() + Math.random(),
        student_id: sid,
        staff_id: staffId || students.find((s) => s.id === sid)?.main_staff_id || staff[0]?.id,
        program_code: programs[0]?.code,
        weekday: 1,
        start_time: '16:00',
        from: '',           // 비우면 1일부터
        isNewRow: true,
        removed: false,
      },
    ])

  // 겹치는 줄인지 (선생님·요일·시간이 검사 결과와 같으면)
  const clashKeys = useMemo(() => {
    const set = new Set()
    clash.forEach((c) => {
      const sf = staff.find((x) => x.name === c.staff_name)?.id
      set.add(`${sf}|${c.weekday}|${c.a_start.slice(0, 5)}`)
      set.add(`${sf}|${c.weekday}|${c.b_start.slice(0, 5)}`)
    })
    return set
  }, [clash, staff])

  const isClash = (r) => clashKeys.has(`${r.staff_id}|${r.weekday}|${r.start_time}`)

  const endOf = (r) => {
    const mins = programs.find((p) => p.code === r.program_code)?.minutes || 50
    const [h, m] = r.start_time.split(':').map(Number)
    const t = h * 60 + m + mins
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }

  if (loading) return <Loading />
  if (!rows) return <Empty>시간표를 불러오지 못했습니다.</Empty>

  return (
    <div>
      <Card style={{ padding: '13px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 시간표 짜기</div>
          <div style={{ fontSize: 12, color: C.sub }}>
            {from === ym ? '지금 시간표' : `${prev.replace('-', '년 ')}월에서 가져옴`} · 수업{' '}
            {stat.live}개
            {stat.changed > 0 && (
              <b style={{ color: C.pkd, marginLeft: 6 }}>바뀐 곳 {stat.changed}</b>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
            {onNewStudent && (
              <Btn onClick={onNewStudent} style={{ padding: '6px 13px', fontSize: 12.5 }}>
                + 새 아동
              </Btn>
            )}
            <Btn
              disabled={busy}
              onClick={async () => {
                if (backups) return setBackups(null)
                try {
                  setBackups(await onLoadBackups())
                } catch {
                  setBackups([])
                }
              }}
            >
              지난 기록
            </Btn>
            <Btn
              disabled={busy || stat.changed === 0}
              onClick={() => {
                setRows((rs) =>
                  rs.filter((r) => base.has(key(r))).map((r) => ({ ...r, removed: false }))
                )
                say('되돌렸습니다')
              }}
            >
              되돌리기
            </Btn>
            <Btn
              variant="primary"
              disabled={busy}
              onClick={async () => {
                const live = rows.filter((r) => !r.removed)
                if (!live.length) return say('수업이 하나도 없습니다', 'err')
                const payload = live.map((r) => ({
                  student_id: r.student_id,
                  staff_id: r.staff_id,
                  program_code: r.program_code,
                  weekday: r.weekday,
                  start_time: r.start_time,
                  ...(r.from ? { from: r.from } : {}),
                  ...(r.to ? { to: r.to } : {}),
                }))
                // 적용 전에 겹치는 곳을 미리 찾아 화면에 표시합니다
                let bad = []
                try {
                  bad = (await onCheck(payload)) || []
                } catch {
                  bad = []
                }
                setClash(bad)
                if (bad.length) {
                  say(`시간이 겹치는 곳이 ${bad.length}군데 있습니다. 빨간 줄을 고쳐주세요`, 'err')
                  return
                }
                if (
                  confirm(
                    `${ym.replace('-', '년 ')}월 시간표를 이대로 적용할까요?\n\n` +
                      `· 수업 ${live.length}개\n` +
                      (locked > 0 ? `· 이미 진행한 ${locked}건은 그대로 둡니다\n` : '') +
                      `· ${prev.replace('-', '년 ')}월까지는 바뀌지 않습니다`
                  )
                )
                  onApply(payload)
              }}
            >
              {ym.replace('-', '년 ')}월에 적용
            </Btn>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.65 }}>
          {from === ym
            ? `${ym.replace('-', '년 ')}월 시간표입니다. 바뀐 곳만 고치고 `
            : `${prev.replace('-', '년 ')}월 시간표를 그대로 가져왔습니다. 바뀐 곳만 고치고 `}
          <b>적용</b>을 누르세요.
          {locked > 0 && (
            <>
              {' '}
              이 달에 이미 진행한 수업 <b>{locked}건</b>은 그대로 남습니다.
            </>
          )}
          <br />
          <b>{prev.replace('-', '년 ')}월 이전 기록은 절대 바뀌지 않습니다.</b>
          <br />
          달 중간에 들어온 아동은 <b>수업 추가</b>로 넣고 <b>시작</b> 날짜를 정해주세요.
        </div>
      </Card>

      {clash.length > 0 && (
        <Card style={{ padding: '13px 16px', marginBottom: 14, border: `1px solid ${C.danger}`, background: '#FDECEF' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.danger, marginBottom: 6 }}>
            시간이 겹치는 곳 {clash.length}군데
          </div>
          {clash.map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, color: '#8A3550', lineHeight: 1.75 }}>
              {c.staff_name} {PLAN_DOW[c.weekday]}요일 —{' '}
              <b>
                {c.a_student} {c.a_start.slice(0, 5)}~{c.a_end.slice(0, 5)}
              </b>{' '}
              와{' '}
              <b>
                {c.b_student} {c.b_start.slice(0, 5)}~{c.b_end.slice(0, 5)}
              </b>
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#8A3550', marginTop: 7, lineHeight: 1.6 }}>
            아래 빨간 줄의 시간이나 선생님을 바꾸고 다시 적용하세요. 고친 내용은 그대로 남아 있습니다.
          </div>
        </Card>
      )}

      {backups && (
        <Card style={{ overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>시간표 되돌리기</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
              시간표를 적용할 때마다 직전 상태가 저장됩니다. 잘못 적용했으면 그 시점으로 되돌리세요.
              출결을 찍은 회차는 그대로 남습니다.
            </div>
          </div>
          {backups.length === 0 ? (
            <Empty>아직 저장된 기록이 없습니다.</Empty>
          ) : (
            backups.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}
              >
                <div style={{ fontSize: 12.5, color: C.sub, minWidth: 128 }}>
                  {new Date(b.created_at).toLocaleString('ko-KR', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{b.note}</div>
                <div style={{ fontSize: 12, color: C.mut }}>수업 {b.rows}개</div>
                <Btn
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`${b.note} 시점으로 되돌릴까요?\n\n지금 시간표는 따로 저장되니 다시 되돌릴 수 있습니다.`))
                      onRestore(b.id)
                  }}
                  style={{ padding: '5px 12px', fontSize: 12.5 }}
                >
                  이 시점으로
                </Btn>
              </div>
            ))
          )}
        </Card>
      )}

      <MonthOnlyCard
        ym={ym}
        leaves={monthLeaves}
        outside={monthOutside}
        staff={staff}
        busy={busy}
        onAddLeave={onAddLeave}
        onRemoveLeave={onRemoveLeave}
        onAddOutside={onAddOutside}
        onRemoveOutside={onRemoveOutside}
      />

      <div style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 8px' }}>
        매주 반복되는 수업{' '}
        <span style={{ fontSize: 12, fontWeight: 400, color: C.sub, marginLeft: 7 }}>
          고치고 아래 적용을 누르세요
        </span>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {byStaff.map((g) => (
          <div key={g.id}>
            <div
              style={{
                padding: '8px 14px',
                background: g.id === 'etc' || g.id === 'gone' ? '#F4F5F6' : toneOf(g.name).bg,
                color: g.id === 'etc' || g.id === 'gone' ? C.sub : toneOf(g.name).fg,
                fontSize: 13, fontWeight: 700,
                borderTop: `1px solid ${C.line2}`,
                borderBottom: `1px solid ${C.line2}`,
              }}
            >
              {g.name}
              <span style={{ fontWeight: 400, marginLeft: 7, opacity: 0.8 }}>{g.kids.length}명</span>
              {g.gone && (
                <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 11.5 }}>
                  다시 다니면 <b>수정</b>에서 상태를 재원으로 바꾼 뒤 수업을 넣어주세요
                </span>
              )}
            </div>
            {g.kids.map((s, si) => (
          <div
            key={s.id}
            style={{
              padding: '10px 14px',
              borderBottom: si === g.kids.length - 1 ? 'none' : `1px solid ${C.line2}`,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ width: 92, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
              {s.gone && <Pill tone="gray">{s.status}</Pill>}
              {s.shared && (
                <div style={{ fontSize: 10.5, color: C.sub }} title="다른 선생님 수업도 있는 아동입니다">
                  다른 선생님도
                </div>
              )}
              {onEditStudent && (
                <button
                  onClick={() => onEditStudent(s)}
                  style={{
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 11.5, color: C.sub, textAlign: 'left', textDecoration: 'underline',
                  }}
                >
                  수정
                </button>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              {s.items.map((r) => {
                const isNew = !base.has(key(r)) && !r.removed
                const bad = !r.removed && isClash(r)
                return (
                  <div
                    key={r.uid}
                    style={{
                      display: 'flex',
                      gap: 5,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      opacity: r.removed ? 0.42 : 1,
                      background: bad ? '#FDECEF' : 'transparent',
                      border: bad ? `1px solid ${C.danger}` : '1px solid transparent',
                      borderRadius: 8,
                      padding: bad ? '5px 7px' : '0',
                      margin: bad ? '-1px 0' : 0,
                    }}
                  >
                    <select
                      value={r.weekday}
                      disabled={r.removed}
                      onChange={(e) => set(r.uid, { weekday: Number(e.target.value) })}
                      style={{ ...planSel, width: 56 }}
                    >
                      {[1, 2, 3, 4, 5, 6].map((d) => (
                        <option key={d} value={d}>
                          {PLAN_DOW[d]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      step={300}
                      value={r.start_time}
                      disabled={r.removed}
                      onChange={(e) => set(r.uid, { start_time: e.target.value })}
                      style={{ ...planSel, width: 132 }}
                    />
                    <span style={{ fontSize: 11.5, color: C.mut, minWidth: 38 }}>~{endOf(r)}</span>
                    <select
                      value={r.program_code}
                      disabled={r.removed}
                      onChange={(e) => set(r.uid, { program_code: e.target.value })}
                      style={{ ...planSel, width: 126 }}
                    >
                      {programs.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.staff_id}
                      disabled={r.removed}
                      onChange={(e) => set(r.uid, { staff_id: e.target.value })}
                      style={{ ...planSel, width: 84 }}
                    >
                      {staff
                        .filter((x) => x.active)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                    {!r.isNewRow && !r.from && !r.to && !r.showDates && !r.removed && (
                      <button
                        onClick={() => set(r.uid, { showDates: true })}
                        title="달 중간에 시작하거나 끝나는 수업이면 날짜를 넣으세요"
                        style={{ border: 'none', background: 'none', color: C.sub, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: '0 2px' }}
                      >
                        날짜
                      </button>
                    )}
                    {(r.isNewRow || r.from || r.showDates) && !r.removed && (
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.sub }}
                        title="비우면 이 달 1일부터 시작합니다"
                      >
                        <span>시작</span>
                        <input
                          type="date"
                          value={r.from || ''}
                          min={ym + '-01'}
                          max={monthEnd}
                          onChange={(e) => set(r.uid, { from: e.target.value })}
                          style={{ ...planSel, width: 132, padding: '5px 7px' }}
                        />
                      </label>
                    )}
                    {(r.to || r.showDates) && !r.removed && (
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.sub }}
                        title="이 날까지만 수업합니다"
                      >
                        <span>까지</span>
                        <input
                          type="date"
                          value={r.to || ''}
                          min={r.from || ym + '-01'}
                          max={monthEnd}
                          onChange={(e) => set(r.uid, { to: e.target.value })}
                          style={{ ...planSel, width: 132, padding: '5px 7px' }}
                        />
                      </label>
                    )}
                    {r.removed ? (
                      <>
                        <Pill tone="pink">뺌</Pill>
                        <Btn
                          onClick={() => set(r.uid, { removed: false })}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          되살리기
                        </Btn>
                      </>
                    ) : (
                      <>
                        {isNew && <Pill tone="amber">바뀜</Pill>}
                        <Btn
                          onClick={() => set(r.uid, { removed: true })}
                          style={{ padding: '4px 9px', fontSize: 12, color: C.danger }}
                        >
                          ×
                        </Btn>
                      </>
                    )}
                  </div>
                )
              })}
              {!s.gone && (
                <Btn
                  onClick={() => addRow(s.id, g.id === 'etc' ? null : g.id)}
                  style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                >
                  + 수업 추가
                </Btn>
              )}
            </div>
          </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  )
}

const planSel = {
  fontSize: 13,
  padding: '6px 8px',
  border: '1px solid #DEE0E3',
  borderRadius: 7,
  background: '#fff',
}


/* ═════════════════ HomeView.jsx ═════════════════ */

/* 동그란 진행 표시 */
function Dot({ state }) {
  if (state === 'done')
    return (
      <span
        style={{
          width: 18, height: 18, borderRadius: 99, flex: 'none',
          background: C.ok, position: 'relative', display: 'inline-block',
        }}
      >
        <span
          style={{
            position: 'absolute', left: 6, top: 3, width: 4, height: 8,
            border: 'solid #fff', borderWidth: '0 2px 2px 0', transform: 'rotate(45deg)',
          }}
        />
      </span>
    )
  return (
    <span
      style={{
        width: 18, height: 18, borderRadius: 99, flex: 'none', background: '#fff',
        border: `2px solid ${state === 'now' ? C.pk : C.line}`,
        boxShadow: state === 'now' ? `inset 0 0 0 3px ${C.pk}` : 'none',
        display: 'inline-block',
      }}
    />
  )
}

function TaskRow({ state, title, desc, action, onGo, first }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px',
        borderBottom: `1px solid ${C.line2}`,
        background: state === 'now' ? C.pkl : 'transparent',
      }}
    >
      <Dot state={state} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <Btn variant={state === 'now' ? 'primary' : 'default'} onClick={onGo} style={{ padding: '6px 13px', fontSize: 12.5 }}>
        {action || (state === 'now' ? '지금 하기' : '열기')}
      </Btn>
    </div>
  )
}

function HomeView({ ym, onPrevYm, onNextYm, onLoad, onGo, busy }) {
  const [h, setH] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showLater, setShowLater] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    onLoad(ym)
      .then((r) => alive && setH(r))
      .catch(() => alive && setH(null))
      .finally(() => alive && setLoading(false))
  }, [ym])

  const nextYm = shiftYm(ym, 1)
  const nextLabel = `${Number(nextYm.slice(5))}월`
  const thisLabel = `${Number(ym.slice(5))}월`

  // 오늘 날짜로 지금 할 일과 나중 할 일을 나눕니다
  const today = new Date()
  const isThisMonth = ym === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const day = today.getDate()

  const tasks = useMemo(() => {
    if (!h) return { now: [], later: [] }
    const madePlan = (h.next_sessions || 0) > 0
    const allReceipts = (h.next_students || 0) > 0 && h.next_receipts >= h.next_students
    const closingDone = (h.closing_total || 0) > 0 && h.closing_done >= h.closing_total
    const paidAll = (h.unpaid_students || 0) === 0

    const plan = {
      key: 'plan',
      state: madePlan ? 'done' : 'todo',
      title: `${nextLabel} 시간표 짜기`,
      desc: madePlan
        ? `수업 ${h.next_templates}개 · 회차 ${h.next_sessions}건 만들어짐`
        : '아직 안 짰습니다 · 이번 달 것에서 가져옵니다',
      go: 'plan',
    }
    const receipt = {
      key: 'receipt',
      state: allReceipts ? 'done' : 'todo',
      title: `${nextLabel} 영수증 발행`,
      desc: h.next_students
        ? `${h.next_students}명 · ${h.next_receipts} / ${h.next_students}장 발행`
        : `${nextLabel} 회차를 먼저 만들어주세요`,
      go: 'billing-next',
    }
    const makeup = {
      key: 'makeup',
      state: (h.unmade_up || 0) === 0 ? 'done' : 'todo',
      title: '보강 잡기',
      desc:
        (h.unmade_up || 0) === 0
          ? '보강할 수업이 없습니다'
          : `미보강 ${h.unmade_up}건 · 가장 오래된 건 ${h.unmade_oldest}일 지났습니다`,
      go: 'makeup',
    }
    const closing = {
      key: 'closing',
      state: closingDone ? 'done' : 'todo',
      title: `${thisLabel} 마감 · 급여`,
      desc: h.closing_total
        ? `선생님 ${h.closing_total}명 중 ${h.closing_done}명 마감함 (정산 › 급여에서)`
        : '정산 › 급여에서 선생님별로 마감하세요',
      go: 'closing',
    }
    const pay = {
      key: 'pay',
      state: 'todo',
      title: `${thisLabel} 급여 확인`,
      desc: h.payroll_staff
        ? `선생님 ${h.payroll_staff}명 · 합계 ${won(h.payroll_total)}원`
        : '급여 비율을 먼저 넣어주세요',
      go: 'payroll',
    }
    const paid = {
      key: 'paid',
      state: paidAll ? 'done' : 'todo',
      title: `${thisLabel} 입금 확인`,
      desc: paidAll ? '미납이 없습니다' : `미납 ${h.unpaid_students}명 · ${won(h.unpaid_amount)}원`,
      go: 'payment',
    }

    // 달 중순까지는 다음 달 준비, 월초에는 지난달 마무리를 앞으로
    const early = isThisMonth && day <= 10
    const order = early ? [closing, pay, paid, plan, receipt, makeup] : [plan, receipt, makeup, closing, pay, paid]

    const undone = order.filter((t) => t.state !== 'done')
    const done = order.filter((t) => t.state === 'done')
    const now = undone.slice(0, 2)
    if (now.length) now[0] = { ...now[0], state: 'now' }
    return { now, later: [...undone.slice(2), ...done] }
  }, [h, nextLabel, thisLabel, isThisMonth, day])

  if (loading) return <Loading />
  if (!h) return <Empty>불러오지 못했습니다.</Empty>

  return (
    <div>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 15px', borderBottom: `1px solid ${C.line2}`, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Btn onClick={onPrevYm} style={{ padding: '5px 11px' }}>←</Btn>
          <div style={{ fontSize: 15.5, fontWeight: 700 }}>{ym.replace('-', '년 ')}월</div>
          <Btn onClick={onNextYm} style={{ padding: '5px 11px' }}>→</Btn>
        </div>

        {tasks.now.length === 0 ? (
          <div style={{ padding: '18px 15px', fontSize: 14, color: C.sub, textAlign: 'center' }}>
            이번 달 할 일을 다 마쳤습니다.
          </div>
        ) : (
          tasks.now.map((t) => (
            <TaskRow key={t.key} state={t.state} title={t.title} desc={t.desc} onGo={() => onGo(t.go)} />
          ))
        )}

        {tasks.later.length > 0 && (
          <>
            <button
              onClick={() => setShowLater(!showLater)}
              style={{
                width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                padding: '11px 15px', fontSize: 13, color: C.sub, background: '#FBFBFC',
                borderBottom: `1px solid ${C.line2}`,
              }}
            >
              {showLater ? '▾' : '▸'} 나중에 할 일 <b style={{ color: C.ink }}>{tasks.later.length}개</b>
              {!showLater && (
                <span style={{ marginLeft: 7, color: C.mut }}>
                  {tasks.later.map((t) => t.title.replace(/^\d+월\s*/, '')).join(' · ')}
                </span>
              )}
            </button>
            {showLater &&
              tasks.later.map((t) => (
                <TaskRow key={t.key} state={t.state} title={t.title} desc={t.desc} onGo={() => onGo(t.go)} />
              ))}
          </>
        )}

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '13px 15px' }}>
          <Btn
            onClick={() => onGo('mark')}
            style={{ padding: '9px 15px', fontSize: 13.5, borderColor: C.pk, color: C.pkd, fontWeight: 700 }}
          >
            결강 찍기
          </Btn>
          <Btn onClick={() => onGo('week')} style={{ padding: '9px 15px', fontSize: 13.5 }}>
            전체 시간표
          </Btn>
          <Btn onClick={() => onGo('students')} style={{ padding: '9px 15px', fontSize: 13.5 }}>
            아동
          </Btn>
          <Btn onClick={() => onGo('plan')} style={{ padding: '9px 15px', fontSize: 13.5 }}>
            휴무일 · 외부 일정
          </Btn>
        </div>
      </Card>
    </div>
  )
}

/* 결강 찍기 — 최근 며칠을 날짜별로 */
function MarkView({ onLoad, onMark, busy, say }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = () => {
    setLoading(true)
    onLoad(7)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const byDay = useMemo(() => {
    if (!rows) return []
    const m = {}
    rows.forEach((r) => {
      if (!m[r.d]) m[r.d] = []
      m[r.d].push(r)
    })
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const yest = new Date(today.getTime() - 86400000)
  const yiso = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`

  if (loading) return <Loading />
  if (!rows || rows.length === 0) return <Empty>최근 7일에 수업이 없습니다.</Empty>

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ padding: '13px 15px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>결강 찍기</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
          아이가 안 온 수업만 눌러주세요. 정상 진행한 수업은 아무것도 안 누르시면 됩니다.
        </div>
      </div>

      {byDay.map(([d, list]) => (
        <div key={d}>
          <div
            style={{
              padding: '9px 15px 4px', fontSize: 12, fontWeight: 700, color: C.sub,
              background: '#FBFBFC', borderBottom: `1px solid ${C.line2}`,
            }}
          >
            {d === iso ? '오늘 · ' : d === yiso ? '어제 · ' : ''}
            {d.slice(5)} ({list[0].weekday})
          </div>
          {list.map((r) => {
            const off = r.status === '결강'
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px',
                  borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap',
                  background: off ? '#FDECEF' : 'transparent',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, minWidth: 62 }}>{r.student_name}</div>
                <div style={{ fontSize: 12.5, color: C.sub }}>
                  {hhmm(r.start_time)} · {r.staff_name}
                </div>
                {off && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.danger }}>
                    결강{r.needs_makeup ? ' · 미보강' : ' · 보강완료'}
                  </div>
                )}
                <div style={{ marginLeft: 'auto' }}>
                  {r.status === '취소' ? (
                    <span style={{ fontSize: 12, color: C.mut }}>취소됨</span>
                  ) : (
                    <Btn
                      disabled={busy}
                      variant={off ? 'default' : 'danger'}
                      onClick={async () => {
                        await onMark(r.id, off ? '진행' : '결강')
                        reload()
                      }}
                      style={{ padding: '5px 12px', fontSize: 12.5 }}
                    >
                      {off ? '되돌리기' : '결강'}
                    </Btn>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </Card>
  )
}


/* ═════════════════ TimetablePrint.jsx ═════════════════ */

function ttIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* 선생님 한 분의 한 달 — 날짜마다 한 줄, 시간은 가로 */
const TT_DOW = '일월화수목금토'

function ttMin(t) {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

function TeacherSheet({ ym, teacher, sessions, holidays, tone, outside = [] }) {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()

  // 이 선생님 수업(원장님은 외부 일정까지)에 맞춰 시간 범위를 잡습니다
  const mins = [...sessions, ...outside].map((s) => ttMin(s.start_time))
  const maxs = [...sessions, ...outside].map((s) => ttMin(s.end_time))
  let st = mins.length ? Math.floor(Math.min(...mins) / 60) * 60 : 13 * 60
  let en = maxs.length ? Math.ceil(Math.max(...maxs) / 60) * 60 : 19 * 60
  if (en - st < 240) en = st + 240
  const span = en - st
  const pct = (v) => `${(((v - st) / span) * 100).toFixed(3)}%`

  const byDay = {}
  sessions.forEach((s) => {
    if (!byDay[s.d]) byDay[s.d] = []
    byDay[s.d].push(s)
  })
  // 원장님 외부 일정도 같은 줄에 (진한 회색)
  outside.forEach((e) => {
    if (!byDay[e.d]) byDay[e.d] = []
    byDay[e.d].push({ ...e, id: 'out-' + e.id, out: true })
  })

  const rows = []
  let prevWeek = null
  for (let d = 1; d <= lastDay; d++) {
    const x = new Date(y, m - 1, d)
    const w = x.getDay()
    if (w === 0) continue
    const iso = ttIso(x)
    const mon = new Date(x)
    mon.setDate(mon.getDate() - ((w + 6) % 7))
    const wk = ttIso(mon)
    rows.push({ d, w, iso, newWeek: prevWeek !== null && wk !== prevWeek })
    prevWeek = wk
  }

  const ticks = []
  for (let t = st; t <= en; t += 30) ticks.push(t)

  return (
    <div className="tt-page">
      <div className="tt-ph">
        <b>{teacher.name} 선생님</b>
        <span>
          {y}년 {m}월
        </span>
        <span className="tt-lg">
          <span>
            <i style={{ background: '#E9B93A', height: 3, verticalAlign: 2 }} />
            50분 이상 빈 시간
          </span>
          <span>
            <i style={{ background: '#fff', border: '1.5px dashed #E07B00', borderLeft: `3px solid ${tone.line}` }} />
            보강
          </span>
          {outside.length > 0 && (
            <span>
              <i style={{ background: OUT_TONE.bg }} />
              외부 일정
            </span>
          )}
        </span>
      </div>

      <div className="tt-tbl">
        <div className="tt-axis">
          <div />
          <div className="tt-lane">
            {ticks
              .filter((t) => t % 60 === 0)
              .map((t) => (
                <span key={t} className="tt-tk" style={{ left: pct(t) }}>
                  {t / 60}시
                </span>
              ))}
          </div>
        </div>

        {rows.map((r) => {
          const off = holidays[r.iso]
          const list = (byDay[r.iso] || [])
            .map((s) => ({ ...s, s0: ttMin(s.start_time), s1: ttMin(s.end_time) }))
            .sort((a, b) => a.s0 - b.s0)

          const gaps = []
          for (let i = 0; i < list.length - 1; i++) {
            const g0 = list[i].s1
            const g1 = list[i + 1].s0
            if (g1 - g0 >= 50) gaps.push([g0, g1])
          }

          return (
            <div key={r.iso} className={`tt-row${r.newWeek ? ' tt-wk' : ''}${off ? ' tt-off' : ''}`}>
              <div className={`tt-dt${r.w === 6 ? ' tt-sat' : ''}`}>
                {m}/{r.d} <i>{TT_DOW[r.w]}</i>
              </div>
              <div className="tt-lane">
                {ticks.map((t) => (
                  <div key={t} className={`tt-vl${t % 60 === 0 ? ' tt-h' : ''}`} style={{ left: pct(t) }} />
                ))}
                {off ? (
                  <span className="tt-lbl">{off}</span>
                ) : (
                  <>
                    {gaps.map(([g0, g1]) => (
                      <div
                        key={g0}
                        className="tt-gap"
                        style={{ left: pct(g0), width: `${(((g1 - g0) / span) * 100).toFixed(3)}%` }}
                      />
                    ))}
                    {list.map((s) => {
                      const mk = s.status === '보강'
                      const ab = s.status === '결강'
                      if (s.out)
                        return (
                          <div
                            key={s.id}
                            className="tt-ev"
                            title={s.memo || ''}
                            style={{
                              left: pct(s.s0),
                              width: `calc(${(((s.s1 - s.s0) / span) * 100).toFixed(3)}% - 1px)`,
                              background: OUT_TONE.bg, borderColor: OUT_TONE.bd, borderLeftColor: OUT_TONE.bd, color: OUT_TONE.fg,
                            }}
                          >
                            <b>{s.label}</b>
                            <small>
                              <span className="tt-outtag">외부</span>
                              {hhmm(s.start_time)}
                              <span className="tt-end">~{hhmm(s.end_time)}</span>
                            </small>
                          </div>
                        )
                      return (
                        <div
                          key={s.id}
                          className={`tt-ev${mk ? ' tt-mk' : ''}${ab ? ' tt-ab' : ''}`}
                          style={{
                            left: pct(s.s0),
                            width: `calc(${(((s.s1 - s.s0) / span) * 100).toFixed(3)}% - 1px)`,
                            background: mk ? '#fff' : tone.bg,
                            borderColor: tone.bd,
                            borderLeftColor: tone.line,
                            color: tone.fg,
                            '--ln': tone.line,
                          }}
                        >
                          <b>
                            {mk && <span className="tt-tag">보강</span>}
                            {s.student_name}
                          </b>
                          <small>
                            {hhmm(s.start_time)}
                            <span className="tt-end">~{hhmm(s.end_time)}</span>
                          </small>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


/* 전체 — 한 주에 한 장, 날짜마다 선생님 줄 */
const OUT_TONE = { bg: '#3F4652', bd: '#2B3038', fg: '#FFFFFF' }

function WeekSheet({ ym, days, weekNo, teachers, sessions, outside, holidays, leaves, toneOf, colorOf, ownerName, st, en }) {
  const span = en - st
  const pct = (v) => `${(((v - st) / span) * 100).toFixed(3)}%`
  const ticks = []
  for (let t = st; t <= en; t += 30) ticks.push(t)
  const Lines = () =>
    ticks.map((t) => <div key={t} className={`tt-vl${t % 60 === 0 ? ' tt-h' : ''}`} style={{ left: pct(t) }} />)

  const [y, m] = ym.split('-').map(Number)
  const a = days[0]
  const z = days[days.length - 1]

  const dayBlocks = days.map((x) => {
    const iso = ttIso(x)
    const hol = holidays[iso]
    if (hol) return { iso, x, hol, subs: [] }
    const subs = teachers
      .map((t) => {
        const list = sessions
          .filter((s) => s.d === iso && s.staff_name === t.name)
          .map((s) => ({ ...s, s0: ttMin(s.start_time), s1: ttMin(s.end_time) }))
        const outs =
          t.name === ownerName
            ? outside
                .filter((e) => e.d === iso)
                .map((e) => ({ ...e, out: true, s0: ttMin(e.start_time), s1: ttMin(e.end_time) }))
            : []
        const leave = leaves[`${t.id}|${iso}`]
        const all = [...list, ...outs].sort((p, q) => p.s0 - q.s0)
        return { t, all, leave }
      })
      .filter((r) => r.all.length || r.leave)
    return { iso, x, hol: null, subs }
  })

  return (
    <div className="tt-page">
      <div className="tt-ph">
        <b>전체 시간표</b>
        <span>
          {y}년 {m}월 {weekNo}주 ({a.getMonth() + 1}/{a.getDate()} ~ {z.getMonth() + 1}/{z.getDate()})
        </span>
        <span className="tt-lg">
          {teachers.map((t) => (
            <span key={t.id}>
              <i style={{ background: toneOf(t.name).bg, border: `1px solid ${toneOf(t.name).bd}`, borderLeft: `3px solid ${colorOf(t.name)}` }} />
              {t.name}
            </span>
          ))}
          <span>
            <i style={{ background: OUT_TONE.bg }} />
            외부 일정
          </span>
          <span>
            <i style={{ background: '#fff', border: '1.5px dashed #E07B00' }} />
            보강
          </span>
          <span>
            <i style={{ background: '#E9B93A', height: 3, verticalAlign: 2 }} />
            50분 이상 빈 시간
          </span>
        </span>
      </div>

      <div className="tt-tbl">
        <div className="tt-axis tt-axis3">
          <div />
          <div />
          <div className="tt-lane">
            {ticks
              .filter((t) => t % 60 === 0)
              .map((t) => (
                <span key={t} className="tt-tk" style={{ left: pct(t) }}>
                  {t / 60}시
                </span>
              ))}
          </div>
        </div>

        {dayBlocks.map((d) => {
          const w = d.x.getDay()
          const label = (
            <div className={`tt-dl${w === 6 ? ' tt-sat' : ''}`}>
              {d.x.getMonth() + 1}/{d.x.getDate()}
              <i>{TT_DOW[w]}</i>
            </div>
          )
          if (d.hol)
            return (
              <div key={d.iso} className="tt-day tt-dayoff" style={{ flex: 1 }}>
                {label}
                <div className="tt-lane">
                  <Lines />
                  <span className="tt-lbl">{d.hol}</span>
                </div>
              </div>
            )
          const n = Math.max(d.subs.length, 1)
          return (
            <div key={d.iso} className="tt-day" style={{ flex: n }}>
              {label}
              <div className="tt-subs">
                {d.subs.length === 0 && (
                  <div className="tt-sub">
                    <div className="tt-tn" />
                    <div className="tt-lane">
                      <Lines />
                    </div>
                  </div>
                )}
                {d.subs.map(({ t, all, leave }) => {
                  const tone = toneOf(t.name)
                  const line = colorOf(t.name)
                  const gaps = []
                  for (let i = 0; i < all.length - 1; i++) {
                    if (all[i + 1].s0 - all[i].s1 >= 50) gaps.push([all[i].s1, all[i + 1].s0])
                  }
                  return (
                    <div key={t.id} className="tt-sub">
                      <div className="tt-tn" style={{ color: tone.fg }}>
                        {t.name}
                      </div>
                      <div className="tt-lane" style={leave && !all.length ? { background: 'repeating-linear-gradient(135deg, #F6C9D3 0px, #F6C9D3 4px, #FFFFFF 4px, #FFFFFF 10px)' } : undefined}>
                        <Lines />
                        {leave && !all.length && <span className="tt-lbl tt-lbl-s">{leave}</span>}
                        {gaps.map(([g0, g1]) => (
                          <div key={g0} className="tt-gap" style={{ left: pct(g0), width: `${(((g1 - g0) / span) * 100).toFixed(3)}%` }} />
                        ))}
                        {all.map((s) => {
                          const mk = s.status === '보강'
                          const ab = s.status === '결강'
                          const style = s.out
                            ? { background: OUT_TONE.bg, borderColor: OUT_TONE.bd, borderLeftColor: OUT_TONE.bd, color: OUT_TONE.fg }
                            : { background: mk ? '#fff' : tone.bg, borderColor: tone.bd, borderLeftColor: line, color: tone.fg, '--ln': line }
                          return (
                            <div
                              key={s.id}
                              className={`tt-ev${mk ? ' tt-mk' : ''}${ab ? ' tt-ab' : ''}`}
                              style={{ ...style, left: pct(s.s0), width: `calc(${(((s.s1 - s.s0) / span) * 100).toFixed(3)}% - 1px)` }}
                            >
                              <b>
                                {mk && <span className="tt-tag">보강</span>}
                                {s.out ? s.label : s.student_name}
                              </b>
                              <small>
                                {s.out && <span className="tt-outtag">외부</span>}
                                {hhmm(s.start_time)}
                                <span className="tt-end">~{hhmm(s.end_time)}</span>
                              </small>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimetablePrint({ ym, staff, sessions, outside = [], ownerName, loadHolidays, toneOf, colorOf, onClose, onlyTeacher }) {
  const teachers = useMemo(() => staff.filter((x) => x.active), [staff])
  // 시간표 화면에서 선생님을 골라둔 채 인쇄를 누르면 그 선생님만 골라진 상태로 엽니다
  const [picked, setPicked] = useState(() => {
    const one = onlyTeacher && teachers.find((t) => t.name === onlyTeacher)
    return new Set(one ? [one.id] : teachers.map((t) => t.id))
  })
  const [hols, setHols] = useState([])
  const [mode, setMode] = useState('teacher')

  useEffect(() => {
    const [y, m] = ym.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    loadHolidays(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`)
      .then((r) => setHols(r || []))
      .catch(() => setHols([]))
  }, [ym])

  // 센터 전체 휴무 + 선생님 개인 휴무
  const holFor = (t) => {
    const out = {}
    hols.forEach((h) => {
      if (!h.staff_id) out[h.d] = h.label || '휴무'
      else if (h.staff_id === t.id) out[h.d] = h.label || '휴무'
    })
    return out
  }

  const shown = teachers.filter((t) => picked.has(t.id))

  // ── 전체(주별) 계산 ──
  const monthOut = outside.filter((e) => e.d.slice(0, 7) === ym)
  const centerHol = {}
  const leaves = {}
  hols.forEach((h) => {
    if (!h.staff_id) centerHol[h.d] = h.label || '휴무'
    else leaves[`${h.staff_id}|${h.d}`] = h.label || '휴무'
  })
  const live = sessions.filter((s) => s.status !== '취소')
  const allMin = [...live.map((s) => ttMin(s.start_time)), ...monthOut.map((e) => ttMin(e.start_time))]
  const allMax = [...live.map((s) => ttMin(s.end_time)), ...monthOut.map((e) => ttMin(e.end_time))]
  const gSt = allMin.length ? Math.floor(Math.min(...allMin) / 60) * 60 : 9 * 60
  let gEn = allMax.length ? Math.ceil(Math.max(...allMax) / 60) * 60 : 19 * 60
  if (gEn - gSt < 240) gEn = gSt + 240

  const weeks = (() => {
    const [y, m] = ym.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    const out = []
    let cur = []
    for (let d = 1; d <= last; d++) {
      const x = new Date(y, m - 1, d)
      if (x.getDay() === 0) {
        if (cur.length) out.push(cur)
        cur = []
        continue
      }
      cur.push(x)
    }
    if (cur.length) out.push(cur)
    return out
  })()

  const pageCount = mode === 'all' ? weeks.length : shown.length

  return createPortal(
    <div className="tt-root">
      <style>{`
        .tt-root { position: fixed; inset: 0; background: #E9EAEC; z-index: 100; overflow: auto; }
        .tt-bar { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid ${C.line};
          padding: 11px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .tt-wrap { padding: 16px 12px 40px; overflow-x: auto; }
        .tt-page { width: 297mm; height: 210mm; margin: 0 auto 10mm; background: #fff; padding: 6mm 8mm;
          box-shadow: 0 1px 4px rgba(0,0,0,.12); display: flex; flex-direction: column; box-sizing: border-box; color: ${C.ink}; }
        .tt-ph { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2mm; flex-wrap: wrap; row-gap: 2px; }
        .tt-ph b, .tt-ph > span { white-space: nowrap; }
        .tt-ph b { font-size: 16px; }
        .tt-ph > span { font-size: 14px; color: ${C.sub}; }
        .tt-lg { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px 11px; font-size: 11px !important; align-items: center; white-space: normal !important; }
        .tt-lg > span { white-space: nowrap; }
        .tt-lg i { display: inline-block; width: 22px; height: 10px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
        .tt-tbl { flex: 1; display: flex; flex-direction: column; border-top: 1.5px solid ${C.ink}; min-height: 0; }
        .tt-axis, .tt-row { display: grid; grid-template-columns: 20mm 1fr; }
        .tt-axis { border-bottom: 1.5px solid ${C.ink}; }
        .tt-axis .tt-lane { height: 16px; }
        .tt-tk { position: absolute; top: 1px; font-size: 10px; color: ${C.sub}; transform: translateX(-50%); white-space: nowrap; }
        .tt-row { flex: 1; min-height: 0; border-bottom: 1px solid #E3E5E8; }
        .tt-row.tt-wk { border-top: 1.5px solid #9AA0A6; }
        .tt-dt { font-size: 11.5px; font-weight: 700; display: flex; align-items: center; gap: 4px; padding-left: 3px;
          border-right: 1px solid #D9DBDF; }
        .tt-dt i { font-style: normal; font-weight: 500; color: #8A8F98; }
        .tt-dt.tt-sat i { color: #2E6FD0; }
        .tt-lane { position: relative; margin-right: 6mm; }
        .tt-vl { position: absolute; top: 0; bottom: 0; border-left: 1px solid #EFF0F2; }
        .tt-vl:not(.tt-h) { display: none; }
        .tt-vl.tt-h { border-left-color: #ECEEF1; }
        .tt-gap { position: absolute; bottom: 2px; height: 3px; background: #E9B93A; border-radius: 2px; }
        .tt-ev { position: absolute; top: 1.5px; bottom: 1.5px; border-radius: 3px; padding: 0 4px; overflow: hidden;
          white-space: nowrap; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
          border: 0 solid; border-left-width: 3px; }
        .tt-ev b { font-size: 11px; line-height: 1.12; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .tt-ev small { font-size: 9px; line-height: 1.12; opacity: .85; display: flex; align-items: center; gap: 3px; max-width: 100%; overflow: hidden; }
        .tt-ev.tt-mk { border: 1.5px dashed #E07B00 !important; border-left: 3px solid var(--ln, #999) !important; background: #fff !important; }
        .tt-ev small { opacity: .8; }
        .tt-ev.tt-ab { opacity: .55; }
        .tt-ev.tt-ab b { text-decoration: line-through; }
        .tt-tag { font-size: 9.5px; font-weight: 700; color: #fff; background: #E07B00; border-radius: 99px; padding: 0 4px; flex: none; font-size: 8.5px !important; line-height: 1.3; }
        .tt-row.tt-off .tt-lane { background: repeating-linear-gradient(135deg, #F6C9D3 0px, #F6C9D3 4px, #FFFFFF 4px, #FFFFFF 10px); }
        .tt-row.tt-off .tt-dt { color: #AE2340; }
        .tt-axis3 { grid-template-columns: 17mm 15mm 1fr; }
        .tt-day { display: grid; grid-template-columns: 17mm 1fr; border-bottom: 1.5px solid #9AA0A6; min-height: 0; }
        .tt-dl { font-size: 12.5px; font-weight: 700; display: flex; flex-direction: column; justify-content: center;
          padding-left: 3px; border-right: 1px solid #D9DBDF; }
        .tt-dl i { font-style: normal; font-size: 11px; color: #8A8F98; font-weight: 500; }
        .tt-dl.tt-sat i { color: #2E6FD0; }
        .tt-dayoff .tt-lane { background: repeating-linear-gradient(135deg, #F6C9D3 0px, #F6C9D3 4px, #FFFFFF 4px, #FFFFFF 10px); }
        .tt-dayoff .tt-dl { color: #AE2340; }
        .tt-subs { display: flex; flex-direction: column; min-height: 0; }
        .tt-sub { flex: 1; display: grid; grid-template-columns: 15mm 1fr; border-bottom: 1px solid transparent; min-height: 0; }
        .tt-sub:last-child { border-bottom: none; }
        .tt-tn { font-size: 10.5px; font-weight: 700; display: flex; align-items: center; padding-left: 4px; border-right: 1px solid #E3E5E8; }
        .tt-outtag { font-size: 9px; font-weight: 700; color: #C9CED6; flex: none; }
        .tt-day .tt-ev b { font-size: 10.5px; }
        .tt-row .tt-ev { top: 1px; bottom: 1px; }
        .tt-row .tt-ev b { font-size: 10.5px; line-height: 1.02; }
        .tt-row .tt-ev small { font-size: 8.5px; line-height: 1.02; margin-top: 1px; }
        .tt-end { opacity: .6; margin-left: -2px; }
        .tt-ev b .tt-tag { margin-right: 3px; vertical-align: 1px; }
        .tt-row .tt-tag { font-size: 7.5px !important; line-height: 1.2; padding: 0 3px; }
        .tt-lbl-s { font-size: 10px !important; padding: 0 7px !important; }
        .tt-lbl { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 700;
          color: #fff; background: #C8324F; border-radius: 99px; padding: 1px 9px; }
        @media print {
          /* 종이 크기에 고정하지 않고, 인쇄 영역 폭에 맞춰 줄어들게 합니다.
             브라우저·프린터마다 여백과 배율 계산이 달라도 잘리지 않습니다. */
          @page { size: A4 landscape; margin: 7mm; }
          html, body { height: auto !important; overflow: visible !important; background: #fff !important;
            margin: 0 !important; padding: 0 !important; min-width: 0 !important; }
          body > *:not(.tt-root) { display: none !important; }
          .tt-root { position: static !important; overflow: visible !important; background: #fff; inset: auto; }
          .tt-bar { display: none !important; }
          .tt-wrap { padding: 0 !important; overflow: visible !important; }
          .tt-page { width: 100% !important; height: auto !important; aspect-ratio: 283 / 194;
            max-height: 100vh; margin: 0 !important; padding: 0 !important; box-shadow: none;
            page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .tt-page:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      <div className="tt-bar">
        <div style={{ fontSize: 15, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 시간표 인쇄</div>
        <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 9 }}>
          {[['teacher', '선생님별'], ['all', '전체']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              style={{
                border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 700,
                background: mode === k ? '#fff' : 'transparent', color: mode === k ? C.ink : C.sub,
                boxShadow: mode === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {mode === 'teacher' && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 6 }}>
          {teachers.map((t) => {
            const on = picked.has(t.id)
            return (
              <button
                key={t.id}
                onClick={() => {
                  const n = new Set(picked)
                  on ? n.delete(t.id) : n.add(t.id)
                  setPicked(n)
                }}
                style={{
                  border: `1px solid ${on ? colorOf(t.name) : C.line}`,
                  background: on ? toneOf(t.name).bg : '#fff',
                  color: on ? toneOf(t.name).fg : C.mut,
                  borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {on ? '✓ ' : ''}
                {t.name}
              </button>
            )
          })}
        </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <Btn variant="primary" disabled={!pageCount} onClick={() => window.print()}>
            {pageCount}장 인쇄
          </Btn>
          <Btn onClick={onClose}>닫기</Btn>
        </div>
      </div>

      <div className="tt-wrap">
        {mode === 'all' &&
          weeks.map((days, i) => (
            <WeekSheet
              key={i}
              ym={ym}
              days={days}
              weekNo={i + 1}
              teachers={teachers}
              sessions={live}
              outside={monthOut}
              holidays={centerHol}
              leaves={leaves}
              toneOf={toneOf}
              colorOf={colorOf}
              ownerName={ownerName}
              st={gSt}
              en={gEn}
            />
          ))}
        {mode === 'teacher' && shown.map((t) => (
          <TeacherSheet
            key={t.id}
            ym={ym}
            teacher={t}
            tone={{ ...toneOf(t.name), line: colorOf(t.name) }}
            holidays={holFor(t)}
            sessions={sessions.filter((s) => s.staff_name === t.name && s.status !== '취소')}
            outside={t.name === ownerName ? outside.filter((e) => e.d.slice(0, 7) === ym) : []}
          />
        ))}
        {mode === 'teacher' && !shown.length && (
          <div style={{ textAlign: 'center', color: C.sub, padding: 40 }}>뽑을 선생님을 골라주세요.</div>
        )}
      </div>
    </div>,
    document.body
  )
}


/* ═════════════════ AddSession.jsx ═════════════════ */

const ADD_DOW = ['일', '월', '화', '수', '목', '금', '토']

/* ================= 보강 기록 (전체 · 달별 → 선생님별) ================= */
function MakeupLog({ rows, staffOrder = [], ownerName, toneOf }) {
  const rank = (n) => (n === ownerName ? -1 : staffOrder.indexOf(n) < 0 ? 99 : staffOrder.indexOf(n))
  const md = (d) => (d ? d.slice(5).replace('-', '/') : '')
  const hm2 = (t) => (t ? t.slice(0, 5) : '')

  const months = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      if (!m[r.ym]) m[r.ym] = {}
      if (!m[r.ym][r.staff_name]) m[r.ym][r.staff_name] = []
      m[r.ym][r.staff_name].push(r)
    })
    return Object.entries(m)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([ym, byStaff]) => {
        const list = Object.values(byStaff).flat()
        return {
          ym,
          total: list.length,
          todo: list.filter((r) => !r.makeup_d).length,
          groups: Object.entries(byStaff)
            .sort((a, b) => rank(a[0]) - rank(b[0]))
            .map(([name, items]) => ({
              name,
              // 아직 보강 안 한 것부터 위로, 보강 끝난 건 아래로
              items: items.sort((a, b) => {
                const at = a.makeup_d ? 1 : 0
                const bt = b.makeup_d ? 1 : 0
                if (at !== bt) return at - bt
                return a.absent_d.localeCompare(b.absent_d)
              }),
              todo: items.filter((r) => !r.makeup_d).length,
            })),
        }
      })
  }, [rows, staffOrder, ownerName])

  const done = rows.filter((r) => r.makeup_d).length
  const todo = rows.length - done

  if (!rows.length) return <Empty>아직 결강 기록이 없습니다.</Empty>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>보강 기록</div>
        <span style={{ fontSize: 12.5, color: C.sub }}>결강한 수업을 언제 보강했는지 모아 둔 곳이에요</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 13, color: C.sub }}>
            결강 <b style={{ fontSize: 15, color: C.ink }}>{rows.length}</b>건
          </span>
          <span style={{ fontSize: 13, color: C.sub }}>
            보강함 <b style={{ fontSize: 15, color: '#1F5B3A' }}>{done}</b>건
          </span>
          <span style={{ fontSize: 13, color: C.sub }}>
            아직 <b style={{ fontSize: 15, color: todo ? C.danger : C.mut }}>{todo}</b>건
          </span>
        </div>
      </div>

      {months.map((mth) => (
        <Card key={mth.ym} style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div
            style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              background: '#FBFBFC', borderBottom: `1px solid ${C.line2}`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{mth.ym.replace('-', '년 ')}월</div>
            <span style={{ fontSize: 12, color: C.sub }}>결강 {mth.total}건</span>
            {mth.todo > 0 ? <Pill tone="pink">아직 {mth.todo}건</Pill> : <Pill tone="green">모두 보강함</Pill>}
          </div>

          {mth.groups.map((g) => (
            <div key={g.name}>
              <div
                style={{
                  padding: '6px 14px', fontSize: 12.5, fontWeight: 700,
                  background: toneOf ? toneOf(g.name).bg : '#F7F8F9',
                  color: toneOf ? toneOf(g.name).fg : C.ink,
                  borderBottom: `1px solid ${C.line2}`,
                }}
              >
                {g.name} 선생님
                <span style={{ fontWeight: 400, marginLeft: 7, opacity: 0.85 }}>{g.items.length}건</span>
                {g.todo > 0 && <span style={{ fontWeight: 400, marginLeft: 7, opacity: 0.85 }}>· 아직 {g.todo}건</span>}
              </div>
              {g.items.map((r) => (
                <div
                  key={r.absent_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: '9px 14px', borderBottom: `1px solid ${C.line2}`, fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700, minWidth: 64 }}>{r.student_name}</div>
                  <div style={{ color: C.sub, minWidth: 110, fontSize: 12 }}>{r.program_label}</div>
                  <div style={{ color: C.danger, whiteSpace: 'nowrap' }}>
                    {md(r.absent_d)} {hm2(r.absent_start)} 결강
                  </div>
                  <div style={{ color: C.mut }}>→</div>
                  {r.makeup_d ? (
                    <div style={{ fontWeight: 700, color: '#1F5B3A', whiteSpace: 'nowrap' }}>
                      {md(r.makeup_d)} {hm2(r.makeup_start)} 보강
                    </div>
                  ) : (
                    <Pill tone="pink">아직</Pill>
                  )}
                  {r.by_other && (
                    <span style={{ fontSize: 11.5, color: C.sub, background: '#F2F3F5', borderRadius: 99, padding: '2px 8px' }}>
                      {r.makeup_staff} 선생님이 함
                    </span>
                  )}
                  {r.note && <span style={{ fontSize: 11.5, color: C.mut, marginLeft: 'auto' }}>{r.note}</span>}
                </div>
              ))}
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}

function AddSessionModal({ students, staff, programs, absent, pairs = [], onClose, onSave, busy }) {
  const linked = !!absent
  const [staffId, setStaffId] = useState(absent?.staff_id || staff[0]?.id || '')

  // 고른 선생님이 가르치는 아이들 (수업 기록 + 담당으로 지정된 아이)
  const myKids = useMemo(() => {
    if (!staffId) return students
    const ids = new Set(pairs.filter((x) => x.staff_id === staffId).map((x) => x.student_id))
    students.forEach((k) => {
      if (k.main_staff_id === staffId) ids.add(k.id)
    })
    const list = students.filter((k) => ids.has(k.id))
    return list.length ? list : students
  }, [staffId, students, pairs])

  const [studentId, setStudentId] = useState(absent?.student_id || '')
  useEffect(() => {
    if (linked) return
    if (!myKids.some((k) => k.id === studentId)) setStudentId(myKids[0]?.id || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myKids])

  const [pcode, setPcode] = useState(absent?.program_code || programs[0]?.code || '')
  // 그 아이가 그 선생님과 하던 수업 종류와 시간으로 자동 채움 (고칠 수 있습니다)
  useEffect(() => {
    if (linked || !studentId || !staffId) return
    const hit = pairs.find((x) => x.staff_id === staffId && x.student_id === studentId)
    if (!hit) return
    if (hit.program_code) setPcode(hit.program_code)
    if (hit.start_time) setStart(hhmm(hit.start_time))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, staffId])
  const [status, setStatus] = useState(linked ? '보강' : '보강')
  const [date, setDate] = useState(isoOf(new Date()))
  const [start, setStart] = useState(absent ? hhmm(absent.start_time) : '19:00')
  // 길이는 프로그램이 정합니다. 보강은 원래 결강 수업과 같은 길이로.
  const mins = useMemo(() => {
    if (absent) {
      const [h1, m1] = absent.start_time.split(':').map(Number)
      const [h2, m2] = absent.end_time.split(':').map(Number)
      return h2 * 60 + m2 - (h1 * 60 + m1)
    }
    return programs.find((p) => p.code === pcode)?.minutes ?? 50
  }, [absent, pcode, programs])
  const [note, setNote] = useState(absent ? `${absent.d.slice(5).replace('-', '/')} 결강분` : '')

  const end = useMemo(() => {
    const [h, m] = start.split(':').map(Number)
    const t = h * 60 + m + mins
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }, [start, mins])

  const dow = date ? ADD_DOW[new Date(date + 'T00:00:00').getDay()] : ''

  return (
    <Modal onClose={onClose} max={380}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{linked ? '보강 등록' : '수업 직접 추가'}</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
          {linked
            ? `${absent.student_name} · ${absent.d.slice(5).replace('-', '/')} 결강분`
            : '앱 쓰기 전의 결강이나 이미 해준 보강을 기록할 때 쓰세요.'}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {!linked && (
          <>
            <AddField label="선생님">
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={addInp}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </AddField>
            <AddField label={`아동 (${staff.find((x) => x.id === staffId)?.name || ''} 선생님 아이)`}>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={addInp}>
                {myKids.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </AddField>
            <AddField label="프로그램">
              <select value={pcode} onChange={(e) => setPcode(e.target.value)} style={addInp}>
                {programs.map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
            </AddField>
            <AddField label="상태">
              <div style={{ display: 'flex', gap: 6 }}>
                {['보강', '결강', '진행'].map((k) => (
                  <Btn
                    key={k}
                    variant={status === k ? 'primary' : 'default'}
                    onClick={() => setStatus(k)}
                    style={{ flex: 1, padding: '9px 0', fontSize: 13 }}
                  >
                    {k}
                  </Btn>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 1.55 }}>
                {status === '보강' && '급여에 포함되고 수강료는 청구하지 않습니다.'}
                {status === '결강' && '수강료는 청구되고 보강 목록에 올라갑니다.'}
                {status === '진행' && '정상 수업으로 기록됩니다.'}
              </div>
            </AddField>
          </>
        )}

        <AddField label="날짜">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={addInp} />
          {dow && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 5 }}>{dow}요일</div>}
        </AddField>

        <AddField label={`시작 시각 (${mins}분 수업)`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} style={{ ...addInp, width: 'auto' }} />
            <span style={{ fontSize: 13, color: C.sub }}>~ {end}</span>
          </div>
        </AddField>

        <AddField label="메모 (선택)">
          <input value={note} onChange={(e) => setNote(e.target.value)} style={addInp} placeholder="8/12 결강분 등" />
        </AddField>

        <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
          <Btn
            variant="primary"
            disabled={busy || !date || !start || (!linked && !studentId)}
            onClick={() =>
              onSave({
                student_id: linked ? absent.student_id : studentId,
                staff_id: linked ? absent.staff_id : staffId,
                program_code: linked ? absent.program_code : pcode,
                d: date,
                start_time: start,
                end_time: end,
                status: linked ? '보강' : status,
                makeup_for: linked ? absent.id : null,
                note: note.trim() || null,
              })
            }
            style={{ flex: 1, padding: '11px 0' }}
          >
            저장
          </Btn>
          <Btn onClick={onClose} style={{ flex: 1, padding: '11px 0' }}>취소</Btn>
        </div>
      </div>
    </Modal>
  )
}

const addInp = {
  width: '100%', fontSize: 14, padding: '10px 11px',
  border: '1px solid #DEE0E3', borderRadius: 8, background: '#fff',
}

function AddField({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}


/* ═════════════════ PaymentView.jsx ═════════════════ */

function PaymentView({
  ym, rows, revenue, busy, onDeposit, onRefund, onRemoveDeposit, loadHistory, say,
  byStaff = [], staffOrder = [], ownerName, toneOf,
}) {
  const [filter, setFilter] = useState('unpaid')
  const [depositFor, setDepositFor] = useState(null)
  const [refundFor, setRefundFor] = useState(null)
  const [historyFor, setHistoryFor] = useState(null)

  const t = useMemo(() => {
    const billed = rows.reduce((a, b) => a + b.billed, 0)
    const allocated = rows.reduce((a, b) => a + b.allocated, 0)
    const unpaid = rows.filter((r) => r.balance > 0)
    return { billed, allocated, balance: billed - allocated, unpaid }
  }, [rows])

  const shown = useMemo(() => {
    if (filter === 'unpaid') return rows.filter((r) => r.balance > 0)
    if (filter === 'paid') return rows.filter((r) => r.balance <= 0)
    if (filter === 'credit') return rows.filter((r) => r.credit_left > 0)
    return rows
  }, [rows, filter])

  // 선생님별로 묶기 — 청구 화면과 같은 순서(원장님 → 등록 순서)
  //   두 선생님께 배우는 아이는 순서상 먼저 나오는 선생님 묶음에 (청구 화면에서 영수증 버튼이 있는 곳)
  const rank = (n) => (n === ownerName ? -1 : staffOrder.indexOf(n) < 0 ? 99 : staffOrder.indexOf(n))
  const teachersOf = useMemo(() => {
    const m = {}
    byStaff.forEach((b) => {
      if (!m[b.student_id]) m[b.student_id] = new Set()
      m[b.student_id].add(b.staff_name)
    })
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort((a, b) => rank(a) - rank(b))]))
  }, [byStaff, staffOrder, ownerName])
  const groups = useMemo(() => {
    const g = {}
    shown.forEach((r) => {
      const home = teachersOf[r.student_id]?.[0] || r.staff_name || '담당 미지정'
      if (!g[home]) g[home] = []
      g[home].push(r)
    })
    return Object.entries(g)
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([name, list]) => ({
        name,
        list: list.sort((a, b) => a.student_name.localeCompare(b.student_name, 'ko')),
        billed: list.reduce((a, b) => a + b.billed, 0),
        balance: list.reduce((a, b) => a + Math.max(b.balance, 0), 0),
      }))
  }, [shown, teachersOf])

  const copyUnpaid = () => {
    if (!t.unpaid.length) return say('미납이 없습니다')
    const order = groups.flatMap((g) => g.list.map((r) => r.student_id))
    const lines = [...t.unpaid]
      .sort((a, b) => (order.indexOf(a.student_id) + 1 || 999) - (order.indexOf(b.student_id) + 1 || 999))
      .map((r) => `· ${r.student_name}  ${won(r.balance)}원`)
    const msg =
      `[검단ABA] ${ym.replace('-', '년 ')}월 수강료 안내\n\n` +
      `아직 입금이 확인되지 않았습니다.\n확인 후 납부 부탁드립니다.\n\n${lines.join('\n')}\n\n` +
      `검단ABA언어행동연구소`
    navigator.clipboard?.writeText(msg)
    say('미납 목록이 복사됐습니다')
  }

  const pct = t.billed ? Math.round((t.allocated / t.billed) * 100) : 0
  const creditCount = rows.filter((r) => r.credit_left > 0).length

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label="이 달 청구" value={`${won(t.billed)}원`} />
        <Stat label="충당됨" value={`${won(t.allocated)}원`} tone="#1F5B3A" />
        <Stat
          label={`미수 (${t.unpaid.length}명)`}
          value={`${won(t.balance)}원`}
          tone={t.balance > 0 ? C.danger : C.mut}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ height: 8, background: '#EFF0F2', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: C.pk, transition: 'width .3s' }} />
        </div>
        <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5 }}>
          {rows.length}명 중 {rows.length - t.unpaid.length}명 납부 완료 ({pct}%)
          {creditCount > 0 && ` · 선입금 남은 아동 ${creditCount}명`}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8, flexWrap: 'wrap' }}>
          {[
            ['unpaid', `미납 ${t.unpaid.length}`],
            ['paid', '완납'],
            ['credit', `선입금 ${creditCount}`],
            ['all', `전체 ${rows.length}`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 6,
                fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                background: filter === k ? '#fff' : 'transparent',
                color: filter === k ? C.ink : C.sub,
                boxShadow: filter === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <Btn onClick={copyUnpaid} style={{ marginLeft: 'auto' }}>
          미납 안내 문구 복사
        </Btn>
      </div>

      <Card style={{ overflow: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 660 }}>
          <thead>
            <tr style={{ background: '#FBFBFC', color: C.sub }}>
              {['아동', '담당', '이 달 청구', '충당', '미수', '선입금 잔액', ''].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '9px 12px',
                    textAlign: i >= 2 && i <= 5 ? 'right' : 'left',
                    fontWeight: 600,
                    borderBottom: `1px solid ${C.line}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Empty>해당하는 아동이 없습니다.</Empty>
                </td>
              </tr>
            )}
            {groups.map((g) => [
              <tr key={'h-' + g.name}>
                <td
                  colSpan={7}
                  style={{
                    padding: '8px 12px', fontWeight: 700, fontSize: 13,
                    background: toneOf ? toneOf(g.name).bg : '#F7F8F9',
                    color: toneOf ? toneOf(g.name).fg : C.ink,
                    borderBottom: `1px solid ${C.line}`,
                  }}
                >
                  {g.name}
                  <span style={{ fontWeight: 400, marginLeft: 7, opacity: 0.85 }}>{g.list.length}명</span>
                  <span style={{ float: 'right', fontWeight: 400, opacity: 0.9 }}>
                    청구 {won(g.billed)}
                    {g.balance > 0 && <span style={{ marginLeft: 10, fontWeight: 700 }}>미수 {won(g.balance)}</span>}
                  </span>
                </td>
              </tr>,
              ...g.list.map((r) => {
              const done = r.balance <= 0
              const partial = r.allocated > 0 && r.balance > 0
              return (
                <tr key={r.student_id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                  <td style={{ padding: '9px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {r.student_name}
                    {done && (
                      <span style={{ marginLeft: 6 }}>
                        <Pill tone="green">완납</Pill>
                      </span>
                    )}
                    {partial && (
                      <span style={{ marginLeft: 6 }}>
                        <Pill tone="amber">부분</Pill>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '9px 12px', color: C.sub, whiteSpace: 'nowrap' }}>
                    {(teachersOf[r.student_id] || [r.staff_name]).join(' · ')}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{won(r.billed)}</td>
                  <td
                    style={{
                      padding: '9px 12px', textAlign: 'right',
                      color: r.allocated ? '#1F5B3A' : '#C9CCD1',
                      fontWeight: r.allocated ? 600 : 400,
                    }}
                  >
                    {r.allocated ? won(r.allocated) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px', textAlign: 'right',
                      color: r.balance > 0 ? C.danger : '#C9CCD1',
                      fontWeight: r.balance > 0 ? 700 : 400,
                    }}
                  >
                    {r.balance > 0 ? won(r.balance) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px', textAlign: 'right',
                      color: r.credit_left > 0 ? '#254B8C' : '#C9CCD1',
                      fontWeight: r.credit_left > 0 ? 700 : 400,
                    }}
                  >
                    {r.credit_left > 0 ? won(r.credit_left) : '—'}
                    {r.credit_left > 0 && r.billed > 0 && Math.floor(r.credit_left / r.billed) >= 1 && (
                      <span
                        style={{
                          marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#1F5B3A',
                          background: '#EDF7F1', borderRadius: 99, padding: '1px 7px', whiteSpace: 'nowrap',
                        }}
                      >
                        {Math.floor(r.credit_left / r.billed)}개월분
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn
                      variant="ok"
                      disabled={busy}
                      onClick={() => setDepositFor(r)}
                      style={{ padding: '5px 11px', fontSize: 12, marginRight: 5 }}
                    >
                      입금
                    </Btn>
                    <Btn
                      disabled={busy}
                      onClick={() => setRefundFor(r)}
                      style={{ padding: '5px 11px', fontSize: 12, marginRight: 5, color: C.danger }}
                    >
                      환불
                    </Btn>
                    <Btn disabled={busy} onClick={() => setHistoryFor(r)} style={{ padding: '5px 11px', fontSize: 12 }}>
                      내역
                    </Btn>
                  </td>
                </tr>
              )
              }),
            ])}
          </tbody>
        </table>
      </Card>

      <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.75, marginBottom: 16 }}>
        선입금은 받은 순서대로 매달 청구에서 자동으로 빠집니다. 3개월치를 한 번에 받으셔도 달마다 알아서
        차감돼요. <b>선입금 잔액</b>은 앞으로 쓸 수 있는 돈입니다.
        <br />
        지난 달 청구는 영수증을 뽑았으면 <b>영수증 금액</b>, 안 뽑았으면 <b>그 달 수업으로 계산한 금액</b>으로 셉니다. 받은 돈은 오래된 달부터 채워져요.
      </div>

      {revenue && revenue.length > 0 && (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line2}`, fontSize: 14, fontWeight: 700 }}>
            월별 수입
          </div>
          <div style={{ padding: '14px 16px' }}>
            {(() => {
              const max = Math.max(...revenue.map((r) => Math.max(r.billed || 0, r.paid || 0)), 1)
              return [...revenue].reverse().map((r) => (
                <div key={r.ym} style={{ marginBottom: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{r.ym.replace('-', '년 ')}월</span>
                    <span style={{ color: C.sub }}>
                      입금 {won(r.paid)} / 청구 {won(r.billed)}
                    </span>
                  </div>
                  <div style={{ height: 14, background: '#F2F3F5', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${((r.billed || 0) / max) * 100}%`, background: C.pkl }} />
                    <div style={{ position: 'absolute', inset: 0, width: `${((r.paid || 0) / max) * 100}%`, background: C.pk }} />
                  </div>
                </div>
              ))
            })()}
            <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>
              진한 색이 그 달 실제 입금액, 연한 색이 청구액입니다. 선입금을 받은 달은 입금이 더 클 수 있어요.
            </div>
          </div>
        </Card>
      )}

      {depositFor && (
        <DepositModal
          row={depositFor}
          busy={busy}
          onClose={() => setDepositFor(null)}
          onSave={(v) => {
            onDeposit(depositFor.student_id, v)
            setDepositFor(null)
          }}
        />
      )}

      {refundFor && (
        <RefundModal
          row={refundFor}
          busy={busy}
          onClose={() => setRefundFor(null)}
          onSave={(v) => {
            onRefund(refundFor.student_id, v)
            setRefundFor(null)
          }}
        />
      )}

      {historyFor && (
        <HistoryModal
          row={historyFor}
          busy={busy}
          loadHistory={loadHistory}
          onRemove={onRemoveDeposit}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  )
}

function DepositModal({ row, onClose, onSave, busy }) {
  const [amount, setAmount] = useState(row.balance > 0 ? row.balance : row.billed)
  const [date, setDate] = useState(isoOf(new Date()))
  const [method, setMethod] = useState('계좌이체')
  const [memo, setMemo] = useState('')

  const months = row.billed ? (amount / row.billed).toFixed(1) : '0'

  return (
    <Modal onClose={onClose} max={350}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{row.student_name} 입금</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
          이 달 청구 {won(row.billed)}원
          {row.balance > 0 ? ` · 미수 ${won(row.balance)}원` : ' · 완납'}
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>입금액</div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          style={{ width: '100%', fontSize: 16, padding: '11px 12px', border: '1px solid #DEE0E3', borderRadius: 8, fontWeight: 700 }}
        />
        <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
          {[
            ['미수만', row.balance > 0 ? row.balance : row.billed],
            ['1개월', row.billed],
            ['3개월', row.billed * 3],
            ['6개월', row.billed * 6],
          ].map(([l, v]) => (
            <Btn key={l} onClick={() => setAmount(v)} style={{ padding: '5px 10px', fontSize: 12 }}>
              {l}
            </Btn>
          ))}
        </div>
        {amount > row.balance && row.billed > 0 && (
          <div style={{ marginTop: 10, padding: '9px 12px', background: '#EEF3FD', borderRadius: 8, fontSize: 12, color: '#254B8C', lineHeight: 1.6 }}>
            이 달 청구 기준 약 <b>{months}개월치</b>입니다. 남는 금액은 선입금으로 쌓여 다음 달부터 자동
            차감돼요.
          </div>
        )}

        <div style={{ fontSize: 12, color: C.sub, margin: '13px 0 6px' }}>입금일</div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: '100%', fontSize: 14, padding: '10px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
        />

        <div style={{ fontSize: 12, color: C.sub, margin: '13px 0 6px' }}>방법</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['계좌이체', '현금', '카드'].map((m) => (
            <Btn
              key={m}
              variant={method === m ? 'primary' : 'default'}
              onClick={() => setMethod(m)}
              style={{ flex: 1, padding: '9px 0', fontSize: 13 }}
            >
              {m}
            </Btn>
          ))}
        </div>

        <div style={{ fontSize: 12, color: C.sub, margin: '13px 0 6px' }}>메모 (선택)</div>
        <input
          placeholder="3개월치, 형제 합산 등"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
        />

        <div style={{ display: 'flex', gap: 7, marginTop: 16 }}>
          <Btn
            variant="primary"
            disabled={busy || !amount}
            onClick={() => onSave({ amount, date, method, memo: memo.trim() || null })}
            style={{ flex: 1, padding: '11px 0' }}
          >
            기록
          </Btn>
          <Btn onClick={onClose} style={{ flex: 1, padding: '11px 0' }}>
            취소
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

function RefundModal({ row, onClose, onSave, busy }) {
  const [amount, setAmount] = useState(row.credit_left > 0 ? row.credit_left : 0)
  const [date, setDate] = useState(isoOf(new Date()))
  const [method, setMethod] = useState('계좌이체')
  const [memo, setMemo] = useState('')

  const after = (row.credit_left || 0) - amount

  return (
    <Modal onClose={onClose} max={350}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{row.student_name} 환불</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
          누적 입금 {won(row.deposit_total)}원
          {row.credit_left > 0 && ` · 남은 선입금 ${won(row.credit_left)}원`}
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>환불액</div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          style={{ width: '100%', fontSize: 16, padding: '11px 12px', border: '1px solid #DEE0E3', borderRadius: 8, fontWeight: 700 }}
        />
        {row.credit_left > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            <Btn onClick={() => setAmount(row.credit_left)} style={{ padding: '5px 10px', fontSize: 12 }}>
              남은 선입금 전액
            </Btn>
          </div>
        )}
        {amount > 0 && (
          <div
            style={{
              marginTop: 10, padding: '9px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
              background: after < 0 ? '#FDECEF' : '#F4F5F6',
              color: after < 0 ? C.danger : C.sub,
            }}
          >
            {after < 0
              ? `남은 선입금보다 ${won(-after)}원 많습니다. 이미 받은 수업료에서 돌려주는 경우라면 그대로 진행하세요.`
              : `환불 후 남은 선입금 ${won(after)}원`}
          </div>
        )}

        <div style={{ fontSize: 12, color: C.sub, margin: '13px 0 6px' }}>환불일</div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: '100%', fontSize: 14, padding: '10px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
        />

        <div style={{ fontSize: 12, color: C.sub, margin: '13px 0 6px' }}>방법</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['계좌이체', '현금', '카드'].map((m) => (
            <Btn key={m} variant={method === m ? 'primary' : 'default'} onClick={() => setMethod(m)} style={{ flex: 1, padding: '9px 0', fontSize: 13 }}>
              {m}
            </Btn>
          ))}
        </div>

        <div style={{ fontSize: 12, color: C.sub, margin: '13px 0 6px' }}>사유</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 7, flexWrap: 'wrap' }}>
          {['퇴소 환불', '수업 불만족', '센터 사정'].map((m) => (
            <Btn key={m} onClick={() => setMemo(m)} style={{ padding: '5px 10px', fontSize: 12 }}>
              {m}
            </Btn>
          ))}
        </div>
        <input
          placeholder="사유를 적어주세요"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
        />

        <div style={{ display: 'flex', gap: 7, marginTop: 16 }}>
          <Btn
            variant="danger"
            disabled={busy || !amount}
            onClick={() => onSave({ amount, date, method, memo: memo.trim() || '환불' })}
            style={{ flex: 1, padding: '11px 0' }}
          >
            환불 기록
          </Btn>
          <Btn onClick={onClose} style={{ flex: 1, padding: '11px 0' }}>
            취소
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

function HistoryModal({ row, onClose, onRemove, loadHistory, busy }) {
  const [list, setList] = useState(null)

  React.useEffect(() => {
    loadHistory(row.student_id)
      .then(setList)
      .catch(() => setList([]))
  }, [row.student_id])

  const total = (list || []).reduce((a, b) => a + b.amount, 0)

  return (
    <Modal onClose={onClose} max={380}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{row.student_name} 입금 내역</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
          누적 {won(total)}원
          {row.credit_left > 0 && ` · 선입금 잔액 ${won(row.credit_left)}원`}
        </div>
      </div>
      <div style={{ maxHeight: 340, overflow: 'auto' }}>
        {list === null ? (
          <Empty>불러오는 중…</Empty>
        ) : list.length === 0 ? (
          <Empty>입금 기록이 없습니다.</Empty>
        ) : (
          list.map((d) => (
            <div
              key={d.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: `1px solid ${C.line2}` }}
            >
              <div style={{ minWidth: 76, fontSize: 12.5, color: C.sub }}>
                {d.received_on.slice(2).replace(/-/g, '/')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: d.amount < 0 ? C.danger : C.ink }}>
                  {d.amount < 0 ? `환불 ${won(-d.amount)}` : won(d.amount)}원
                </div>
                <div style={{ fontSize: 11.5, color: C.mut }}>
                  {[d.method, d.memo].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <Btn
                disabled={busy}
                onClick={() => {
                  if (confirm(`${d.received_on} ${won(d.amount)}원 기록을 지울까요?`)) {
                    onRemove(d.id)
                    setList(list.filter((x) => x.id !== d.id))
                  }
                }}
                style={{ padding: '5px 10px', fontSize: 12 }}
              >
                삭제
              </Btn>
            </div>
          ))
        )}
      </div>
      <div style={{ padding: 16 }}>
        <Btn onClick={onClose} style={{ width: '100%', padding: '11px 0' }}>
          닫기
        </Btn>
      </div>
    </Modal>
  )
}


/* ═════════════════ PrintAll.jsx ═════════════════ */

/* 도장 — STAMP_URL 이 있으면 실제 이미지, 없으면 그려서 표시 */
//   저장소 public 폴더에 파일을 올린 뒤 아래 경로만 바꾸면 됩니다.
const STAMP_URL = import.meta.env.BASE_URL + 'stamp.png'
const LOGO_URL = import.meta.env.BASE_URL + 'logo.png'

function Stamp({ size = 40 }) {
  if (STAMP_URL) {
    return <img src={STAMP_URL} alt="" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="45" fill="none" stroke="#C0392B" strokeWidth="5" />
      <text x="50" y="34" textAnchor="middle" fill="#C0392B" fontSize="26" fontWeight="700">검단</text>
      <text x="50" y="66" textAnchor="middle" fill="#C0392B" fontSize="26" fontWeight="700">ABA</text>
      <text x="50" y="86" textAnchor="middle" fill="#C0392B" fontSize="15" fontWeight="700">민다혜</text>
    </svg>
  )
}

/* 영수증 한 장 — compact=true 면 3등분용 납작한 형태 */
// '민다혜3, 최성현4' → '민다혜T · 최성현T' (회차 수는 횟수 칸에 있으니 이름만)
function teacherLabel(summary) {
  return (summary || '')
    .split(',')
    .map((x) => x.trim().replace(/\s*\d+$/, ''))
    .filter(Boolean)
    .map((n) => n + ' 선생님')
    .join(' · ')
}

function Sheet({ ym, s, adjustment, reason, compact, stamp, x }) {
  const R = receiptShow(s.subtotal, adjustment, x)
  const partial = R.used > 0 && !R.full
  const showDue = R.carry < 0 || partial
  const total = showDue ? R.due : R.net
  const rowsN = s.lines.length + (adjustment ? 1 : 0) + (R.carry < 0 ? 1 : 0) + (partial ? 1 : 0)
  const F = compact
    ? (rowsN >= 5
        // 줄 수에 맞춰 글자 크기를 정합니다 — 칸(A4 1/3)을 넘치지 않으면서 비어 보이지 않게
        ? { title: 17, sub: 11.5, name: 19, th: 10.5, td: 13, note: 10.5, sum: 21, foot: 11, pad: '5mm 10mm', row: '3px 0', logo: 20, stamp: 40, lbl: 12 }
        : rowsN >= 3
        ? { title: 20, sub: 13, name: 23, th: 12, td: 15.5, note: 12, sum: 26, foot: 12.5, pad: '6mm 11mm', row: '6px 0', logo: 24, stamp: 48, lbl: 14 }
        : { title: 23, sub: 14.5, name: 27, th: 13, td: 17.5, note: 13, sum: 31, foot: 13.5, pad: '7mm 12mm', row: '10px 0', logo: 28, stamp: 58, lbl: 16 })
    : { title: 19, sub: 12.5, name: 18, th: 11, td: 12.5, note: 10.5, sum: 19, foot: 11, pad: '14mm 13mm', row: '8px 0', logo: 34, stamp: 42, lbl: 13 }

  return (
    <div className={compact ? 'receipt-slot' : 'receipt-page'}>
      <div style={{ padding: F.pad, height: compact ? 'auto' : '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', boxSizing: 'border-box' }}>
        {compact ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, borderBottom: `1px solid ${C.pk}`, paddingBottom: 3, marginBottom: 5 }}>
            {LOGO_URL && (
              <img src={LOGO_URL} alt="" style={{ height: F.logo, objectFit: 'contain', alignSelf: 'center' }} />
            )}
            <span style={{ fontSize: F.title, fontWeight: 800, color: C.pkd, letterSpacing: '0.04em' }}>수강료 영수증</span>
            <span style={{ fontSize: F.sub, color: C.sub }}>{ym.replace('-', '년 ')}월</span>
            <span style={{ marginLeft: 'auto', fontSize: F.name, fontWeight: 700 }}>{s.label || s.name}</span>
            <span style={{ fontSize: F.sub, color: C.mut }}>귀하</span>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', borderBottom: `2px solid ${C.pk}`, paddingBottom: 14, marginBottom: 16 }}>
              {LOGO_URL && (
                <img src={LOGO_URL} alt="" style={{ height: 34, objectFit: 'contain', marginBottom: 8 }} />
              )}
              <div style={{ fontSize: F.title, fontWeight: 800, letterSpacing: '0.06em', color: C.pkd }}>수강료 영수증</div>
              <div style={{ fontSize: F.sub, color: C.sub, marginTop: 4 }}>{ym.replace('-', '년 ')}월</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: F.name, fontWeight: 700 }}>{s.label || s.name}</div>
              <div style={{ fontSize: F.sub, color: C.mut }}>귀하</div>
            </div>
          </>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: F.td }}>
          <thead>
            <tr style={{ color: C.mut, fontSize: F.th }}>
              <th style={{ textAlign: 'left', padding: '0 0 3px', fontWeight: 600 }}>수업명</th>
              <th style={{ textAlign: 'right', padding: '0 0 3px', fontWeight: 600, width: '13%' }}>횟수</th>
              <th style={{ textAlign: 'right', padding: '0 0 3px', fontWeight: 600, width: '22%' }}>단가</th>
              <th style={{ textAlign: 'right', padding: '0 0 3px', fontWeight: 600, width: '24%' }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => {
              const absent = new Set((l.absent_dates || []).map((d) => d.slice(-2)))
              const days = (l.session_dates || []).map((d) => {
                const dd = d.slice(-2)
                return { n: Number(dd), a: absent.has(dd) }
              })
              return (
                <tr key={i} style={{ borderTop: `1px solid ${C.line2}` }}>
                  <td style={{ padding: F.row }}>
                    {l.program_label}
                    <div style={{ fontSize: F.note, color: C.mut, lineHeight: 1.35 }}>
                      {/* 최성현5 → 최성현T (회차 수는 옆 칸에 있으니 뺍니다) */}
                      {teacherLabel(l.staff_summary)}
                      {days.length > 0 && ' · '}
                      {days.map((d, k) => (
                        <span
                          key={k}
                          style={{
                            color: d.a ? C.danger : C.ink,
                            fontWeight: 600,
                            marginLeft: k > 0 ? (compact ? 5 : 7) : 0,
                          }}
                        >
                          {k > 0 && <span style={{ color: '#C9CCD1', fontWeight: 400, marginRight: compact ? 5 : 7 }}>·</span>}
                          {d.n}
                          {d.a ? '*' : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: F.row, textAlign: 'right', verticalAlign: 'top' }}>{l.lesson_count}</td>
                  <td style={{ padding: F.row, textAlign: 'right', color: C.sub, verticalAlign: 'top' }}>{won(l.unit_price)}</td>
                  <td style={{ padding: F.row, textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>{won(l.amount)}</td>
                </tr>
              )
            })}
            {!!adjustment && (
              <tr style={{ borderTop: `1px solid ${C.line2}` }}>
                <td colSpan={3} style={{ padding: F.row, color: C.danger }}>
                  조정
                  <span style={{ fontSize: F.note, color: C.mut, marginLeft: 5 }}>{reason || '사유 없음'}</span>
                </td>
                <td style={{ padding: F.row, textAlign: 'right', fontWeight: 600, color: C.danger }}>
                  {won(adjustment)}
                </td>
              </tr>
            )}
            {R.carry < 0 && (
              <tr style={{ borderTop: `1px solid ${C.line2}` }}>
                <td colSpan={3} style={{ padding: F.row, color: C.danger }}>
                  {R.note || '지난 취소분'}
                </td>
                <td style={{ padding: F.row, textAlign: 'right', fontWeight: 600, color: C.danger }}>
                  {won(R.carry)}
                </td>
              </tr>
            )}
            {partial && (
              <tr style={{ borderTop: `1px solid ${C.line2}` }}>
                <td colSpan={3} style={{ padding: F.row, color: '#1F5B3A' }}>선입금 사용</td>
                <td style={{ padding: F.row, textAlign: 'right', fontWeight: 600, color: '#1F5B3A' }}>
                  {won(-R.used)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: compact ? 8 : 10, paddingTop: compact ? 8 : 10, borderTop: `1.5px solid ${C.ink}` }}>
          <div style={{ fontSize: F.lbl, fontWeight: 700 }}>{showDue ? '이번에 내실 금액' : '합계'}</div>
          <div style={{ fontSize: F.sum, fontWeight: 800, color: C.pkd }}>{won(total)}원</div>
        </div>
        {R.full && (
          <div style={{ marginTop: compact ? 3 : 8, textAlign: compact ? 'left' : 'center' }}>
            <span style={{ fontSize: compact ? F.note : 11.5, color: '#1F5B3A', background: '#EDF7F1', borderRadius: 4, padding: '2px 7px', display: 'inline-block' }}>
              선입금에서 결제됨
              {R.left > 0 && ` · 남은 선입금 ${won(R.left)}원`}
              {R.months > 0 && ` (${R.months}개월분)`}
            </span>
          </div>
        )}

        {compact ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
            <div style={{ fontSize: F.foot, textAlign: 'right', lineHeight: 1.4 }}>
              검단ABA언어행동연구소
              <div style={{ color: C.mut }}>대표 민 다 혜{stamp ? '' : ' (인)'}</div>
            </div>
            {stamp && <Stamp size={F.stamp} />}
          </div>
        ) : (
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: F.foot, color: '#4B5057', lineHeight: 1.9 }}>
            위 금액을 정히 영수합니다.
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 5, color: C.ink }}>검단ABA언어행동연구소</div>
            <div style={{ fontSize: 10.5, color: C.mut }}>인천 검단구 이음1로 377 눈담봄 905호</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontWeight: 700, color: C.ink }}>대표 민 다 혜{stamp ? '' : ' (인)'}</span>
              {stamp && <Stamp size={42} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PrintAll({ ym, students, receipts, extras = [], onClose, say }) {
  const xMap = useMemo(() => Object.fromEntries(extras.map((x) => [x.student_id, x])), [extras])
  const [mode, setMode] = useState('three')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const boxRef = useRef(null)

  const rMap = useMemo(() => Object.fromEntries(receipts.map((r) => [r.student_id, r])), [receipts])
  const pages = useMemo(() => {
    if (mode !== 'three') return []
    const out = []
    for (let i = 0; i < students.length; i += 3) out.push(students.slice(i, i + 3))
    return out
  }, [students, mode])

  const saveImages = async () => {
    setSaving(true)
    setProgress(0)
    try {
      const [{ toPng }, JSZipMod] = await Promise.all([
        import('html-to-image'),
        import('jszip'),
      ])
      const JSZip = JSZipMod.default || JSZipMod
      const nodes = [...boxRef.current.querySelectorAll('[data-shot]')]
      const mLabel = String(Number(ym.slice(5))) + '월'
      // 폰트 CDN 을 다시 받으려다 막히므로 건너뜁니다 (화면에 이미 로드돼 있음)
      const opt = (n) => ({
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: n.offsetWidth,
        height: n.offsetHeight,
        skipFonts: true,
        cacheBust: false,
        style: { margin: '0' },
      })

      if (nodes.length === 1) {
        const n = nodes[0]
        const url = await toPng(n, opt(n))
        const a = document.createElement('a')
        a.href = url
        a.download = `${n.dataset.shot} ${mLabel} 영수증.png`
        a.click()
        say('저장했습니다')
        setSaving(false)
        return
      }

      const zip = new JSZip()
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        const url = await toPng(n, opt(n))
        zip.file(`${n.dataset.shot} ${mLabel} 영수증.png`, url.split(',')[1], { base64: true })
        setProgress(i + 1)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = window.URL.createObjectURL(blob)
      a.download = `${ym.replace('-', '년 ')}월 영수증 ${nodes.length}장.zip`
      a.click()
      setTimeout(() => window.URL.revokeObjectURL(a.href), 4000)
      say(`${nodes.length}장을 압축파일로 저장했습니다`)
    } catch (e) {
      say('이미지 저장에 실패했습니다', 'err')
    }
    setSaving(false)
    setProgress(0)
  }

  return createPortal(
    <div className="print-root">
      <style>{`
        .print-root { position: fixed; inset: 0; background: #fff; z-index: 100; overflow: auto; }
        .a4 {
          width: 210mm; min-height: 297mm; margin: 0 auto 8mm;
          background: #fff; border: 1px solid ${C.line}; box-sizing: border-box;
          display: flex; flex-direction: column;
        }
        .receipt-slot {
          flex: 1 1 0; min-height: 0; border-bottom: 1px dashed #B9BCC1;
          display: flex; flex-direction: column; justify-content: center;
        }
        .a4 .receipt-slot:last-child { border-bottom: none; }
        .receipt-page {
          width: 210mm; min-height: 297mm; margin: 0 auto 8mm;
          background: #fff; border: 1px solid ${C.line}; box-sizing: border-box;
        }
        .shot-wrap {
          width: 420px; background: #fff; border: 1px solid ${C.line};
          border-radius: 8px; margin: 0 auto 10px; overflow: hidden;
        }
        .shot-wrap .receipt-page { width: 100%; min-height: 0; margin: 0; border: none; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { height: auto !important; overflow: visible !important; }
          .print-root { position: static !important; overflow: visible !important; height: auto !important; }
          .no-print { display: none !important; }
          .print-wrap { background: #fff !important; padding: 0 !important; }
          .a4, .receipt-page {
            border: none; margin: 0; width: 210mm; height: 297mm;
            page-break-after: always; break-after: page;
          }
          .a4:last-child, .receipt-page:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      <div className="no-print" style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '12px 16px', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {ym.replace('-', '년 ')}월 영수증 {students.length}장
          </div>
          <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8 }}>
            {[
              ['three', `A4 3등분 · ${Math.ceil(students.length / 3)}장`],
              ['one', `한 명씩 · ${students.length}장`],
              ['image', '이미지 저장'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 6,
                  fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                  background: mode === k ? '#fff' : 'transparent',
                  color: mode === k ? C.ink : C.sub,
                  boxShadow: mode === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
            {mode === 'image' ? (
              <Btn variant="primary" disabled={saving} onClick={saveImages}>
                {saving
                  ? progress
                    ? `만드는 중… ${progress}/${students.length}`
                    : '저장 중…'
                  : students.length === 1
                    ? '이미지 저장'
                    : `${students.length}장 압축 저장`}
              </Btn>
            ) : (
              <Btn variant="primary" onClick={() => window.print()}>
                인쇄 / PDF 저장
              </Btn>
            )}
            <Btn onClick={onClose}>닫기</Btn>
          </div>
        </div>
        <div style={{ maxWidth: 900, margin: '8px auto 0', fontSize: 12, color: C.sub, lineHeight: 1.65 }}>
          {mode === 'three' && '한 장에 3명씩 들어갑니다. 점선을 따라 자르세요. 인쇄 창에서 용지 A4, 여백 없음으로 두세요.'}
          {mode === 'one' && '한 명당 한 장입니다. 자르지 않고 그대로 드릴 수 있어요.'}
          {mode === 'image' &&
            '한 명씩 PNG 로 만들어 압축파일(zip) 하나로 내려받습니다. 풀어서 카카오톡으로 보내세요. 밖으로 나가는 파일이라 도장은 빼고 (인) 글자만 들어갑니다.'}
        </div>
      </div>

      <div className="print-wrap" ref={boxRef} style={{ padding: '16px 0', background: mode === 'image' ? C.bg : '#EFEFF1' }}>
        {mode === 'three' &&
          pages.map((group, i) => (
            <div key={i} className="a4">
              {group.map((s) => (
                <Sheet key={s.id} ym={ym} s={s} compact stamp adjustment={rMap[s.id]?.adjustment || 0} reason={rMap[s.id]?.adjust_reason} x={xMap[s.id]} />
              ))}
              {group.length < 3 &&
                Array.from({ length: 3 - group.length }, (_, k) => (
                  <div key={'e' + k} className="receipt-slot" style={{ borderBottom: 'none' }} />
                ))}
            </div>
          ))}

        {mode === 'one' &&
          students.map((s) => (
            <Sheet key={s.id} ym={ym} s={s} stamp adjustment={rMap[s.id]?.adjustment || 0} reason={rMap[s.id]?.adjust_reason} x={xMap[s.id]} />
          ))}

        {mode === 'image' &&
          students.map((s) => (
            <div key={s.id} className="shot-wrap" data-shot={s.name}>
              <Sheet ym={ym} s={s} adjustment={rMap[s.id]?.adjustment || 0} reason={rMap[s.id]?.adjust_reason} x={xMap[s.id]} />
            </div>
          ))}
      </div>
    </div>,
    document.body
  )
}


/* ═════════════════ App.jsx ═════════════════ */

const mondayOf = (d) => {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
  x.setHours(0, 0, 0, 0)
  return x
}

// 한 주가 두 달에 걸치면 목요일이 속한 달을 그 주의 달로 봅니다 (주의 절반 이상)
const weekYm = (monday) => {
  const t = new Date(monday)
  t.setDate(t.getDate() + 3)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}
// 그 달을 대표하는 주 — 오늘이 그 달이면 이번 주, 아니면 그 달 첫 목요일이 있는 주
const weekOfYm = (ym) => {
  const today = new Date()
  const tYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (tYm === ym) return mondayOf(today)
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1)
  return mondayOf(d)
}

function App() {
  const [session, setSession] = useState(undefined)
  const [me, setMe] = useState(null)
  const [staff, setStaff] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)

  const [tab, setTab] = useState('today')
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [ym, setYm] = useState(() => ymOf(new Date()))
  const [closeYm, setCloseYm] = useState(defaultClosingYm)
  const [monthSessions, setMonthSessions] = useState([])
  const [autoGen, setAutoGen] = useState(false)

  const [sessions, setSessions] = useState([])
  const [holidays, setHolidays] = useState([])
  const [today, setToday] = useState([])
  const [unmadeUp, setUnmadeUp] = useState([])
  const [billing, setBilling] = useState([])
  const [byStaff, setByStaff] = useState([])
  const [payroll, setPayroll] = useState([])
  const [myClose, setMyClose] = useState(null)
  const [payments, setPayments] = useState([])
  const [revenue, setRevenue] = useState([])
  const [closings, setClosings] = useState([])
  const [receipts, setReceipts] = useState([])

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [pick, setPick] = useState(null)
  const [receiptFor, setReceiptFor] = useState(null)
  const [filter, setFilter] = useState(null)
  const [makeupFor, setMakeupFor] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [printAll, setPrintAll] = useState(null)
  const [needRegen, setNeedRegen] = useState(false)
  const [schedView, setSchedView] = useState('month')
  const [editStudent, setEditStudent] = useState(null)
  const [ttPrint, setTtPrint] = useState(false)
  const [receiptExtras, setReceiptExtras] = useState([])
  const [payHistory, setPayHistory] = useState([])
  const [makeupTab, setMakeupTab] = useState('todo')
  const [makeupLog, setMakeupLog] = useState([])

  // 어느 선생님이 어느 아이를 가르치는지 (수업 추가 창에서 아이 목록을 고르는 데 씁니다)
  const teacherKidPairs = useMemo(() => {
    const m = new Map()
    monthSessions.forEach((s) => {
      const k = s.staff_id + '|' + s.student_id
      if (!m.has(k))
        m.set(k, {
          staff_id: s.staff_id,
          student_id: s.student_id,
          program_code: s.program_code,
          start_time: s.start_time,
        })
    })
    return [...m.values()]
  }, [monthSessions])
  const [students, setStudents] = useState([])
  const [templates, setTemplates] = useState([])
  const [programs, setPrograms] = useState([])
  const [leaves, setLeaves] = useState([])
  const [outside, setOutside] = useState([])
  const [holidaySeeded, setHolidaySeeded] = useState(false)
  const [manageLoaded, setManageLoaded] = useState(false)

  const say = (msg, tone) => {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 2600)
  }
  // DB 가 돌려주는 영어 오류를 알아보기 쉬운 말로 바꿉니다
  const fail = (e) => {
    const raw = e?.message || String(e)
    if (/uq_student_active_name|students_name_key/.test(raw))
      return say('같은 이름의 아동이 이미 다니고 있습니다. 이름 뒤에 구분을 붙여주세요 (예: 김지환B)', 'err')
    if (/uq_holiday|holidays_pkey/.test(raw)) return say('그 날짜는 이미 휴무일로 등록돼 있습니다', 'err')
    if (/uq_makeup_once/.test(raw)) return say('그 결강에는 이미 보강이 잡혀 있습니다', 'err')
    if (/staff_name_key/.test(raw)) return say('같은 이름의 선생님이 이미 있습니다', 'err')
    if (/duplicate key|unique constraint/i.test(raw)) return say('이미 등록된 내용입니다', 'err')
    if (/violates foreign key/i.test(raw)) return say('연결된 기록이 있어 처리할 수 없습니다', 'err')
    return say(raw, 'err')
  }

  // 선생님 색 번호 — DB에 저장된 번호(color_idx)를 씁니다. 없으면 목록 순서.
  // 주간 화면의 주와 앱이 보고 있는 달을 항상 맞춥니다
  const goWeek = (monday) => {
    setWeekStart(monday)
    const m = weekYm(monday)
    if (m !== ym) setYm(m)
  }
  useEffect(() => {
    // 지금 보는 주에 그 달 날짜가 하루도 없을 때만 그 달로 옮깁니다
    const touches = [0, 1, 2, 3, 4, 5].some((i) => {
      const x = new Date(weekStart)
      x.setDate(x.getDate() + i)
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` === ym
    })
    if (!touches) setWeekStart(weekOfYm(ym))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym])

  const colorIdx = useCallback(
    (name) => {
      const i = staff.findIndex((s) => s.name === name)
      if (i < 0) return 0
      const c = staff[i].color_idx
      return (c === null || c === undefined ? i : c) % TEACHER_COLORS.length
    },
    [staff]
  )

  const toneOf = useCallback((name) => TEACHER_TONES[colorIdx(name)], [colorIdx])

  const colorOf = useCallback((name) => TEACHER_COLORS[colorIdx(name)], [colorIdx])

  /* ---- 인증 ---- */
  useEffect(() => {
    getSession().then(setSession)
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    loadMe()
      .then(({ isAdmin, staff, me }) => {
        setIsAdmin(isAdmin)
        setStaff(staff)
        setMe(me)
        setTab(isAdmin ? 'home' : 'today')
      })
      .catch(fail)
  }, [session])

  /* ---- 데이터 ---- */
  const reloadWeek = useCallback(async () => {
    const from = isoOf(weekStart)
    const e = new Date(weekStart)
    e.setDate(e.getDate() + 6)
    const [ss, hs] = await Promise.all([loadSessions(from, isoOf(e)), loadHolidays(from, isoOf(e))])
    setSessions(ss)
    setHolidays(hs)
  }, [weekStart])

  const reloadCommon = useCallback(async () => {
    const [t, u] = await Promise.all([loadToday(), loadUnmadeUp()])
    setToday(t)
    setUnmadeUp(u)
  }, [])

  const reloadMonthSessions = useCallback(async () => {
    const [y, m] = ym.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    setMonthSessions(await loadSessions(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`))
  }, [ym])

  const reloadMonth = useCallback(async () => {
    const [b, bs, cl, r, pay, rev, pr, mc, rx, ph, ml] = await Promise.all([
      isAdmin ? loadBilling(ym) : Promise.resolve([]),
      isAdmin ? loadBillingByStaff(ym) : Promise.resolve([]),
      loadClosings(ym),
      isAdmin ? loadReceipts(ym) : Promise.resolve([]),
      isAdmin ? loadPayments(ym) : Promise.resolve([]),
      isAdmin ? loadRevenue() : Promise.resolve([]),
      isAdmin ? loadPayroll(ym) : Promise.resolve([]),
      isAdmin ? Promise.resolve(null) : loadMyClosing(closeYm),
      isAdmin ? loadReceiptExtras(ym).catch(() => []) : Promise.resolve([]),
      loadPayrollHistory().catch(() => []),
      loadMakeupLog(null).catch(() => []),
    ])
    setBilling(b)
    setReceiptExtras(rx || [])
    setPayHistory(ph || [])
    setMakeupLog(ml || [])
    setByStaff(bs)
    setClosings(cl)
    setReceipts(r)
    setPayments(pay)
    setRevenue(rev)
    setPayroll(pr)
    setMyClose(mc)
  }, [ym, isAdmin])

  const reloadManage = useCallback(async () => {
    if (!isAdmin) return
    const [st, tp, pg, lv, ev] = await Promise.all([
      loadStudents(),
      loadTemplates(),
      loadPrograms(),
      loadLeaves(),
      loadOutside(),
    ])
    setStudents(st)
    setTemplates(tp)
    setPrograms(pg)
    setLeaves(lv)
    setOutside(ev)
    setManageLoaded(true)
  }, [isAdmin])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth(), reloadManage(), reloadMonthSessions()])
    } catch (e) {
      fail(e)
    }
    setLoading(false)
  }, [reloadWeek, reloadCommon, reloadMonth, reloadManage, reloadMonthSessions])

  useEffect(() => {
    if (session && staff.length) reloadAll()
  }, [session, staff.length, weekStart, ym, closeYm, ym])

  // 공휴일은 앱이 알아서 채워 둡니다 (2026~2030, 대체공휴일·일요일 제외)
  useEffect(() => {
    // 휴무일 목록을 실제로 한 번 읽은 뒤에 판단합니다.
    if (!isAdmin || loading || holidaySeeded || !staff.length || !manageLoaded) return
    const have = new Set(leaves.filter((l) => !l.staff_id).map((l) => l.d))
    const miss = PUBLIC_HOLIDAYS.filter(([d]) => !have.has(d))
    if (!miss.length) {
      setHolidaySeeded(true)
      return
    }
    setHolidaySeeded(true)
    ;(async () => {
      try {
        const n = await seedHolidays(miss)
        if (n > 0) {
          say(`공휴일 ${n}일을 등록했습니다`)
          await reloadAll()
        }
      } catch (e) {
        // 조용히 넘어감 — 다음 접속에 다시 시도
      }
    })()
  }, [isAdmin, loading, leaves.length, staff.length, holidaySeeded, manageLoaded])

  // 월초 결제 대비: 기준월 회차가 비어 있으면 자동으로 만들어 둡니다
  useEffect(() => {
    if (!isAdmin || loading || autoGen || !staff.length) return
    if (billing.length > 0) return
    let alive = true
    setAutoGen(true)
    generateMonth(ym)
      .then(async (n) => {
        if (!alive) return
        if (n > 0) {
          say(`${ym.replace('-', '년 ')}월 회차 ${n}건을 자동으로 준비했습니다`)
          await reloadAll()
        }
      })
      .catch(() => {})
      .finally(() => alive && setAutoGen(false))
    return () => {
      alive = false
    }
  }, [isAdmin, loading, billing.length, ym, staff.length])

  /* ---- 동작 ---- */
  const doMark = async (id, status) => {
    setBusy(true)
    try {
      // 원장님도 선생님과 같은 규칙(정산 잠금·보강 연결 확인)을 거칩니다
      await markAttendance(id, status)
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth(), reloadMonthSessions()])
      setPick(null)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  // 영수증 발행 뒤 취소: 이 달 영수증은 그대로, 다음 영수증에서 차감
  const doCancelCarry = async (p) => {
    const ok = confirm(
      `${p.student_name} ${p.d.slice(5).replace('-', '/')} 수업을 취소합니다.\n\n` +
        `이 달 영수증은 이미 발행돼서 그대로 두고,\n그 수업 수강료를 다음에 발행하는 영수증에서 차감합니다.\n\n` +
        `※ 돈을 바로 돌려드릴 거면 이 방법 대신\n   영수증 잠금을 풀고 → 취소 → 영수증 다시 발행 → 환불 로 해주세요.`
    )
    if (!ok) return
    const reason = prompt('취소 사유 (기록용, 비워도 됩니다)', '센터 사정') ?? ''
    setBusy(true)
    try {
      const msg = await cancelWithCarry(p.id, reason)
      say(msg || '취소했습니다')
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth(), reloadMonthSessions()])
      setPick(null)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }
  const doUndoCarry = async (id) => {
    setBusy(true)
    try {
      const msg = await undoCancelCarry(id)
      say(msg || '되돌렸습니다')
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth(), reloadMonthSessions()])
      setPick(null)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  // 직접 추가한 수업·보강 지우기
  const doRemoveSession = async (p) => {
    if (!confirm(`${p.student_name} ${p.d.slice(5).replace('-', '/')} ${p.start_time.slice(0, 5)} 수업을 지웁니다.\n되돌릴 수 없어요.`)) return
    setBusy(true)
    try {
      const msg = await removeSession(p.id)
      say(msg || '지웠습니다')
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth(), reloadMonthSessions()])
      setPick(null)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  const doGenerate = async () => {
    if (!confirm(`${ym} 회차를 생성합니다.\n이미 있는 회차는 그대로 두고, 시간표가 바뀐 부분만 정리됩니다.`)) return
    setBusy(true)
    try {
      const n = await generateMonth(ym)
      setNeedRegen(false)
      say(`${n}건 생성됐습니다`)
      await reloadAll()
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  const unpaidCount = useMemo(() => payments.filter((p) => p.balance > 0).length, [payments])

  const myClosing = myClose || closings.find((c) => c.staff_name === me?.name)

  const weekMinutes = useMemo(
    () =>
      sessions
        .filter((s) => s.staff_name === me?.name && s.status !== '취소')
        .reduce((a, b) => a + minutesBetween(b.start_time, b.end_time), 0),
    [sessions, me]
  )

  const visible = useMemo(
    () => (isAdmin && filter ? sessions.filter((s) => s.staff_name === filter) : sessions),
    [sessions, isAdmin, filter]
  )

  /* ---- 로그인 화면 ---- */
  if (!hasKey) return <SetupNeeded />
  if (session === undefined) return <Loading />
  if (!session) return <Login onDone={() => {}} say={say} />

  // 탭을 성격별로 세 묶음으로 나눕니다 (원장님 화면)
  const groups = isAdmin
    ? [
        { key: 'home', label: '홈', items: [['home', '홈']] },
        {
          key: 'sched',
          label: '시간표',
          items: [['month', '시간표']],
        },
        {
          key: 'money',
          label: '정산',
          items: [
            ['billing', '청구'],
            ['payment', `입금${unpaidCount ? ` ${unpaidCount}` : ''}`],
          ],
        },
        {
          key: 'setup',
          label: '설정',
          items: [['plan', '시간표 짜기']],
        },
      ]
    : [
        {
          key: 'sched',
          label: '수업',
          items: [
            ['today', '오늘'],
            ['month', '시간표'],
          ],
        },
        { key: 'money', label: '마감', items: [['myclose', '마감']] },
      ]

  const activeGroup = groups.find((g) => g.items.some(([k]) => k === tab)) || groups[0]

  return (
    <div style={{ minHeight: '100vh', background: C.bg }} className={printAll ? 'app-hidden-on-print' : ''}>
      <div className="no-print" style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>검단ABA 시간표</div>

          <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8 }}>
            {groups.map((g) => {
              const on = activeGroup.key === g.key
              const badge =
                g.key === 'sched' ? unmadeUp.length : g.key === 'money' ? unpaidCount : 0
              return (
                <button
                  key={g.key}
                  onClick={() => !on && setTab(g.items[0][0])}
                  style={{
                    border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 6,
                    fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap',
                    background: on ? '#fff' : 'transparent',
                    color: on ? C.ink : C.sub,
                    boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                  }}
                >
                  <span>{g.label}</span>
                  {!on && badge > 0 && (
                    <span
                      style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: 99,
                        background: C.pkd, marginLeft: 5, verticalAlign: 'middle',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{me?.name || '—'}</span>
            <Pill tone={isAdmin ? 'pink' : 'gray'}>{isAdmin ? '원장' : '선생님'}</Pill>
            <Btn variant="ghost" onClick={() => signOut()} style={{ padding: '5px 9px', fontSize: 12 }}>
              로그아웃
            </Btn>
          </div>
        </div>
      </div>

      {activeGroup.items.length > 1 && (
        <div
          className="no-print"
          style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '0 16px' }}
        >
          <div style={{ display: 'flex', gap: 2, maxWidth: 1200, margin: '0 auto', overflowX: 'auto' }}>
            {activeGroup.items.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  padding: '10px 14px', fontSize: 13.5, whiteSpace: 'nowrap',
                  fontWeight: tab === k ? 700 : 500,
                  color: tab === k ? C.pkd : C.sub,
                  borderBottom: `2px solid ${tab === k ? C.pkd : 'transparent'}`,
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        {!loading && isAdmin && needRegen && (
          <div
            className="no-print"
            style={{
              marginBottom: 14, padding: '12px 15px', borderRadius: 10,
              border: `1px solid ${C.pk}`, background: C.pkl,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.pkd }}>
                시간표가 바뀌었습니다
              </div>
              <div style={{ fontSize: 12, color: '#8A3550', marginTop: 2, lineHeight: 1.6 }}>
                수업에 반영하려면 회차를 다시 만들어야 합니다. 이미 출결을 찍은 회차는 그대로 남아요.
              </div>
            </div>
            <Btn variant="primary" disabled={busy} onClick={doGenerate}>
              {ym.replace('-', '년 ')}월 회차 다시 만들기
            </Btn>
          </div>
        )}

        {!loading && isAdmin && unmadeUp.length > 0 && (
          <div className="no-print" style={{ marginBottom: 14 }}>
            <button
              onClick={() => {
                setTab('month')
                setSchedView('makeup')
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                border: `1px solid #F0D49B`,
                background: '#FEF6E7',
                borderRadius: 10,
                padding: '12px 15px',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8A5A00' }}>
                보강 안 한 수업 {unmadeUp.length}건
              </div>
              <div style={{ fontSize: 12, color: '#8A5A00', opacity: 0.8, marginTop: 2 }}>
                {(() => {
                  const oldest = Math.max(...unmadeUp.map((u) => daysSince(u.d)))
                  return `가장 오래된 건 ${oldest}일 지났습니다`
                })()}
              </div>
            </button>
          </div>
        )}

        {loading && <Loading />}

        {!loading && tab === 'today' && (
          <TodayView today={today} weekMinutes={weekMinutes} onMark={doMark} busy={busy} />
        )}

        {!loading && tab === 'home' && isAdmin && (
          <HomeView
            ym={ym}
            busy={busy}
            onPrevYm={() => setYm(shiftYm(ym, -1))}
            onNextYm={() => setYm(shiftYm(ym, 1))}
            onLoad={loadHome}
            onGo={(where) => {
              if (where === 'plan') {
                setTab('plan')
              } else if (where === 'billing-next') {
                setYm(shiftYm(ym, 1))
                setTab('billing')
              } else if (where === 'makeup') {
                setTab('month')
                setSchedView('makeup')
              } else if (where === 'week') {
                setTab('month')
                setSchedView('week')
              } else if (where === 'mark') {
                setTab('mark')
              } else if (where === 'students') {
                setTab('plan')
              } else if (where === 'closing' || where === 'payroll') {
                setTab('billing')
              } else {
                setTab(where)
              }
            }}
          />
        )}

        {!loading && tab === 'mark' && (
          <MarkView
            busy={busy}
            say={say}
            onLoad={loadRecentSessions}
            onMark={async (id, status) => {
              setBusy(true)
              try {
                await markAttendance(id, status)
                say(status === '결강' ? '결강으로 표시했습니다' : '진행으로 되돌렸습니다')
                await reloadAll()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
          />
        )}

        {!loading && tab === 'month' && (
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 9, width: 'fit-content' }}>
            {[
              ['month', '월'],
              ['week', '주'],
              ...(isAdmin ? [['makeup', `보강${unmadeUp.length ? ` ${unmadeUp.length}` : ''}`]] : []),
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSchedView(k)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 18px', borderRadius: 7,
                  fontSize: 13, fontWeight: 700,
                  background: schedView === k ? '#fff' : 'transparent',
                  color: schedView === k ? C.ink : C.sub,
                  boxShadow: schedView === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Btn onClick={() => setTtPrint(true)} style={{ marginLeft: 'auto', padding: '6px 13px', fontSize: 12.5 }}>
              시간표 인쇄
            </Btn>
          )}
          </div>
        )}

        {!loading && tab === 'month' && schedView === 'month' && (
          <MonthView
            ym={ym}
            staff={isAdmin ? staff : null}
            filter={filter}
            onFilter={setFilter}
            colorOf={colorOf}
            sessions={isAdmin && filter ? monthSessions.filter((x) => x.staff_name === filter) : monthSessions}
            busy={busy}
            isAdmin={isAdmin}
            onPrevYm={() => setYm(shiftYm(ym, -1))}
            onNextYm={() => setYm(shiftYm(ym, 1))}
            onMark={doMark}
          />
        )}

        {!loading && tab === 'myclose' && (
          <MyClosingView
            ym={closeYm}
            onPrevYm={() => setCloseYm(shiftYm(closeYm, -1))}
            onNextYm={() => setCloseYm(shiftYm(closeYm, 1))}
            summary={myClosing}
            closing={myClosing}
            busy={busy}
            onSubmit={async () => {
              setBusy(true)
              try {
                await submitClosing(closeYm)
                say('제출했습니다')
                await reloadMonth()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
          />
        )}

        {!loading && tab === 'month' && schedView === 'week' && (
          <>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
              <Btn
                onClick={() => {
                  const d = new Date(weekStart)
                  d.setDate(d.getDate() - 7)
                  goWeek(d)
                }}
                style={{ padding: '6px 11px' }}
              >
                ←
              </Btn>
              <div style={{ fontSize: 14.5, fontWeight: 700, minWidth: 118 }}>
                {weekStart.getMonth() + 1}월 {weekStart.getDate()}일 주
              </div>
              <Btn
                onClick={() => {
                  const d = new Date(weekStart)
                  d.setDate(d.getDate() + 7)
                  goWeek(d)
                }}
                style={{ padding: '6px 11px' }}
              >
                →
              </Btn>
              <Btn onClick={() => goWeek(mondayOf(new Date()))} style={{ padding: '6px 11px' }}>
                오늘
              </Btn>

              {isAdmin && (
                <div style={{ display: 'flex', gap: 5, marginLeft: 8, flexWrap: 'wrap' }}>
                  <Btn
                    variant={!filter ? 'primary' : 'default'}
                    onClick={() => setFilter(null)}
                    style={{ padding: '5px 11px', fontSize: 12.5, borderRadius: 99 }}
                  >
                    전체
                  </Btn>
                  {staff
                    .filter((s) => s.active)
                    .map((s) => (
                      <Btn
                        key={s.id}
                        onClick={() => setFilter(filter === s.name ? null : s.name)}
                        style={{
                          padding: '5px 11px',
                          fontSize: 12.5,
                          borderRadius: 99,
                          background: filter === s.name ? colorOf(s.name) : '#fff',
                          color: filter === s.name ? '#fff' : C.sub,
                          borderColor: filter === s.name ? colorOf(s.name) : '#E3E5E8',
                        }}
                      >
                        {s.name}
                      </Btn>
                    ))}
                </div>
              )}
            </div>

            <WeekGrid
              weekStart={weekStart}
              sessions={visible}
              holidays={holidays}
              colorOf={colorOf}
              toneOf={toneOf}
              staffOrder={staff.map((x) => x.name)}
              outside={!filter || filter === staff.find((x) => x.role === 'admin')?.name ? outside : []}
              ownerName={staff.find((x) => x.role === 'admin')?.name}
              onPick={setPick}
              today={isoOf(new Date())}
            />

            <div style={{ display: 'flex', gap: 14, marginTop: 11, flexWrap: 'wrap', fontSize: 11.5, color: C.sub }}>
              {staff
                .filter((x) => x.active)
                .map((x) => {
                  const t = toneOf(x.name)
                  return (
                    <span key={x.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          width: 12, height: 12, borderRadius: 3,
                          background: t.bg, border: `1px solid ${t.bd}`,
                          borderLeft: `3px solid ${colorOf(x.name)}`,
                        }}
                      />
                      {x.name}
                    </span>
                  )
                })}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 6 }}>
                <span
                  style={{
                    width: 12, height: 12, borderRadius: 3, border: `1px solid ${C.line}`,
                    background:
                      'repeating-linear-gradient(135deg, #EFEFF1, #EFEFF1 3px, #FFFFFF 3px, #FFFFFF 6px)',
                  }}
                />
                <span style={{ textDecoration: 'line-through' }}>결강 · 취소</span>
              </span>
            </div>
          </>
        )}

        {!loading && tab === 'month' && schedView === 'makeup' && (
          <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8, width: 'fit-content', marginBottom: 12 }}>
            {[['todo', `아직 안 함 ${unmadeUp.length}`], ['log', '보강 기록']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMakeupTab(k)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '5px 14px', borderRadius: 6,
                  fontSize: 12.5, fontWeight: 600,
                  background: makeupTab === k ? '#fff' : 'transparent',
                  color: makeupTab === k ? C.ink : C.sub,
                  boxShadow: makeupTab === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {!loading && tab === 'month' && schedView === 'makeup' && makeupTab === 'log' && (
          <MakeupLog
            rows={makeupLog}
            staffOrder={staff.map((x) => x.name)}
            ownerName={staff.find((x) => x.role === 'admin')?.name}
            toneOf={toneOf}
          />
        )}

        {!loading && tab === 'month' && schedView === 'makeup' && makeupTab === 'todo' && (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line2}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>보강해야 할 수업 {unmadeUp.length}건</div>
                {isAdmin && (
                  <Btn
                    variant="primary"
                    onClick={() => setAddOpen(true)}
                    style={{ marginLeft: 'auto', padding: '6px 13px', fontSize: 12.5 }}
                  >
                    수업 직접 추가
                  </Btn>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
                결강했지만 아직 보강 날짜가 안 잡힌 수업입니다. 월정액이라 수강료는 이미 받은 회차예요.
                앱을 쓰기 전의 결강이나 이미 해준 보강은 <b>수업 직접 추가</b>로 기록하세요.
              </div>
            </div>
            {unmadeUp.length === 0 ? (
              <Empty>보강할 수업이 없습니다.</Empty>
            ) : (
              [...unmadeUp].sort((a, b) => a.d.localeCompare(b.d)).map((s) => (
                <div
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 18px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}
                >
                  <span style={{ width: 4, height: 24, borderRadius: 2, background: colorOf(s.staff_name) }} />
                  <div style={{ minWidth: 64, fontSize: 14, fontWeight: 700 }}>{s.student_name}</div>
                  <div style={{ fontSize: 12, color: C.sub, minWidth: 140 }}>
                    {s.d.slice(5).replace('-', '/')} ({s.weekday}) {hhmm(s.start_time)}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, minWidth: 60 }}>{s.staff_name}</div>
                  {(() => {
                    const n = daysSince(s.d)
                    const tone = n >= 30 ? 'pink' : n >= 14 ? 'amber' : 'gray'
                    return <Pill tone={tone}>{n}일 지남</Pill>
                  })()}
                  <div style={{ marginLeft: 'auto' }}>
                    <Btn variant="primary" disabled={busy} onClick={() => setMakeupFor(s)} style={{ padding: '6px 13px', fontSize: 12.5 }}>
                      보강 잡기
                    </Btn>
                  </div>
                </div>
              ))
            )}
          </Card>
        )}


        {!loading && tab === 'billing' && isAdmin && (
          <>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
              <Btn onClick={() => setYm(shiftYm(ym, -1))} style={{ padding: '6px 11px' }}>
                ←
              </Btn>
              <div style={{ fontSize: 15, fontWeight: 700, minWidth: 96, textAlign: 'center' }}>
                {ym.replace('-', '년 ')}월
              </div>
              <Btn onClick={() => setYm(shiftYm(ym, 1))} style={{ padding: '6px 11px' }}>
                →
              </Btn>
              {ym !== ymOf(new Date()) && (
                <Btn onClick={() => setYm(ymOf(new Date()))} style={{ padding: '6px 11px' }}>
                  이번 달
                </Btn>
              )}
              <Btn disabled={busy} onClick={doGenerate} style={{ marginLeft: 6 }}>
                회차 다시 만들기
              </Btn>
              {billing.length === 0 && !busy && (
                <span style={{ fontSize: 12.5, color: C.danger, fontWeight: 600 }}>
                  이 달 수업이 없습니다
                </span>
              )}
            </div>
            <BillingView
              ym={ym}
              staffOrder={staff.map((x) => x.name)}
              toneOf={toneOf}
              closings={closings}
              onClose={async (sid, undo) => {
                const t = staff.find((x) => x.id === sid)?.name || '선생님'
                const ok2 = confirm(
                  undo
                    ? `${t} ${ym.slice(5)}월 마감을 취소합니다.\n출결을 다시 고칠 수 있게 됩니다. (급여 기록은 남아 있어요)`
                    : `${t} ${ym.slice(5)}월을 마감합니다.\n\n· 이 달 급여가 기록에 저장됩니다\n· 그 달 출결이 잠겨서 더 이상 안 바뀝니다\n\n나중에 취소할 수 있어요.`
                )
                if (!ok2) return
                setBusy(true)
                try {
                  const msg = await closeMonth(ym, sid, undo)
                  say(msg || (undo ? '마감을 취소했습니다' : '마감했습니다'))
                  await Promise.all([reloadMonth(), reloadMonthSessions(), reloadWeek()])
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              payHistory={payHistory}
              onPayrollPaid={async (m, sid, clear) => {
                setBusy(true)
                try {
                  const msg = await markPayrollPaid(m, sid, clear === null ? null : isoOf(new Date()))
                  say(msg || '표시했습니다')
                  await reloadMonth()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              ownerName={staff.find((x) => x.role === 'admin')?.name}
              lines={billing}
              byStaff={byStaff}
              payroll={payroll}
              receipts={receipts}
              busy={busy}
              onOpenReceipt={setReceiptFor}
              onPrintAll={setPrintAll}
              onDetail={(sid) => loadPayrollDetail(ym, sid)}
              closing={
                <ClosingView
                  ym={ym}
                  embedded
                  rows={closings}
                  staff={staff}
                  busy={busy}
                  onRequest={async (sid) => {
                    setBusy(true)
                    try {
                      const n = await requestClosing(ym, sid)
                      say(`${n}명을 마감 대상으로 표시했습니다. 단톡방 문구를 복사해 보내주세요`)
                      await reloadMonth()
                    } catch (e) {
                      fail(e)
                    }
                    setBusy(false)
                  }}
                  onReview={async (sid, approve, reason) => {
                    setBusy(true)
                    try {
                      await reviewClosing(ym, sid, approve, reason)
                      say(approve ? '승인했습니다' : '반려했습니다')
                      await reloadMonth()
                    } catch (e) {
                      fail(e)
                    }
                    setBusy(false)
                  }}
                />
              }
              onSetRate={async (sid, rate) => {
                setBusy(true)
                try {
                  await setPayRate(sid, rate)
                  say('급여 비율을 저장했습니다')
                  await reloadMonth()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
            />
          </>
        )}

        {!loading && tab === 'payment' && isAdmin && (
          <>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
              <Btn onClick={() => setYm(shiftYm(ym, -1))} style={{ padding: '6px 11px' }}>←</Btn>
              <div style={{ fontSize: 15, fontWeight: 700, minWidth: 96, textAlign: 'center' }}>
                {ym.replace('-', '년 ')}월
              </div>
              <Btn onClick={() => setYm(shiftYm(ym, 1))} style={{ padding: '6px 11px' }}>→</Btn>
            </div>
            <PaymentView
              ym={ym}
              rows={payments}
              byStaff={byStaff}
              staffOrder={staff.map((x) => x.name)}
              ownerName={staff.find((x) => x.role === 'admin')?.name}
              toneOf={toneOf}
              revenue={revenue}
              busy={busy}
              say={say}
              loadHistory={depositHistory}
              onDeposit={async (sid, v) => {
                setBusy(true)
                try {
                  await addDeposit(sid, v)
                  say('입금을 기록했습니다')
                  await reloadMonth()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onRefund={async (sid, v) => {
                setBusy(true)
                try {
                  await addRefund(sid, v)
                  say('환불을 기록했습니다')
                  await reloadMonth()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onRemoveDeposit={async (id) => {
                setBusy(true)
                try {
                  await removeDeposit(id)
                  say('입금 기록을 지웠습니다')
                  await reloadMonth()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
            />
          </>
        )}


        {!loading && tab === 'plan' && isAdmin && (
          <>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <Btn onClick={() => setYm(shiftYm(ym, -1))} style={{ padding: '6px 11px' }}>←</Btn>
              <div style={{ fontSize: 15, fontWeight: 700, minWidth: 96, textAlign: 'center' }}>
                {shiftYm(ym, 1).replace('-', '년 ')}월
              </div>
              <Btn onClick={() => setYm(shiftYm(ym, 1))} style={{ padding: '6px 11px' }}>→</Btn>
            </div>
            <PlanView
              key={shiftYm(ym, 1)}
              ym={shiftYm(ym, 1)}
              students={students}
              staff={staff}
              programs={programs}
              busy={busy}
              say={say}
              onLoadPlan={loadMonthPlan}
              onLoadLocked={loadPlanLocked}
              onLoadBackups={loadPlanBackups}
              onCheck={checkMonthPlan}
              toneOf={toneOf}
              onEditStudent={(s) => setEditStudent(s)}
              onNewStudent={() => setEditStudent('new')}
              leaves={leaves}
              outside={outside}
              onAddLeave={async (v) => {
                setBusy(true)
                try {
                  const msg = await addLeave(v)
                  setNeedRegen(true)
                  say(msg || '등록했습니다')
                  await reloadAll()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onRemoveLeave={async (id) => {
                setBusy(true)
                try {
                  await removeLeave(id)
                  setNeedRegen(true)
                  say('삭제했습니다')
                  await reloadAll()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onAddOutside={async (v) => {
                setBusy(true)
                try {
                  await addOutside(v)
                  say('일정을 등록했습니다')
                  await reloadManage()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onRemoveOutside={async (id) => {
                setBusy(true)
                try {
                  await removeOutside(id)
                  say('삭제했습니다')
                  await reloadManage()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onRestore={async (id) => {
                setBusy(true)
                try {
                  const msg = await restorePlanBackup(id)
                  say(msg || '되돌렸습니다')
                  setNeedRegen(false)
                  await reloadAll()
                  setTab('week')
                  setTimeout(() => setTab('plan'), 50)
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
              onApply={async (rows) => {
                setBusy(true)
                try {
                  const msg = await applyMonthPlan(shiftYm(ym, 1), rows)
                  say(msg || '적용했습니다')
                  setNeedRegen(false)
                  await reloadAll()
                } catch (e) {
                  fail(e)
                }
                setBusy(false)
              }}
            />
          </>
        )}

      </div>

      {(makeupFor || addOpen) && (
        <AddSessionModal
          absent={makeupFor}
          students={students.filter((x) => x.status === '재원')}
          staff={staff.filter((x) => x.active)}
          pairs={teacherKidPairs}
          programs={programs}
          busy={busy}
          onClose={() => {
            setMakeupFor(null)
            setAddOpen(false)
          }}
          onSave={async (v) => {
            setBusy(true)
            try {
              await addSession(v)
              say(v.status === '보강' ? '보강을 등록했습니다' : '수업을 추가했습니다')
              await reloadAll()
              setMakeupFor(null)
              setAddOpen(false)
            } catch (e) {
              fail(e)
            }
            setBusy(false)
          }}
        />
      )}

      {/* 출결 입력 */}
      {pick && (
        <Modal onClose={() => setPick(null)} max={380}>
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{pick.student_name}</div>
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
              {pick.d.slice(5).replace('-', '월 ')}일 ({pick.weekday}) · {hhmm(pick.start_time)}–
              {hhmm(pick.end_time)} · {pick.staff_name}
            </div>
            <div style={{ fontSize: 12.5, color: C.sub }}>{pick.program_label}</div>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>
              출결 · 지금 <b style={{ color: C.ink }}>{pick.status === '진행' ? '수업함' : pick.status}</b>
            </div>
            {(() => {
              const cur = pick.status
              // 선생님: 결강 / 되돌리기만. 원장님: 결강 · 취소 / 되돌리기
              if (cur === '보강')
                return (
                  <div>
                    <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                      보강 수업입니다.{!isAdmin && ' 바꾸려면 원장님께 말씀해주세요.'}
                    </div>
                    {isAdmin && (
                      <Btn
                        disabled={busy}
                        onClick={() => doRemoveSession(pick)}
                        style={{ width: '100%', padding: '11px 0', fontSize: 14, marginTop: 10, color: C.danger }}
                      >
                        이 수업 지우기
                      </Btn>
                    )}
                  </div>
                )
              if (!isAdmin && cur === '취소')
                return (
                  <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                    원장님이 취소한 수업이라 바꿀 수 없어요.
                  </div>
                )
              const locked = !!pick.billing_locked
              // 영수증 발행 뒤 '다음 달 차감'으로 취소한 수업
              if (locked && cur === '취소')
                return isAdmin ? (
                  <div>
                    <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, marginBottom: 8 }}>
                      영수증 발행 뒤 취소한 수업입니다. 수강료는 다음 영수증에서 차감돼요.
                    </div>
                    <Btn disabled={busy} onClick={() => doUndoCarry(pick.id)} style={{ width: '100%', padding: '11px 0', fontSize: 14 }}>
                      취소 되돌리기
                    </Btn>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>원장님이 취소한 수업이라 바꿀 수 없어요.</div>
                )
              const btns = []
              if (cur !== '진행') btns.push(['진행', '되돌리기'])
              if (cur !== '결강') btns.push(['결강', '결강'])
              if (isAdmin && cur !== '취소') btns.push(locked ? ['carry', '취소 (다음 달 차감)'] : ['취소', '취소'])
              return (
                <div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {btns.map(([st, label]) => (
                    <Btn
                      key={st}
                      variant={st === '진행' ? 'default' : st === '결강' ? 'danger' : 'default'}
                      disabled={busy}
                      onClick={() => (st === 'carry' ? doCancelCarry(pick) : doMark(pick.id, st))}
                      style={{ flex: 1, padding: '11px 0', fontSize: st === 'carry' ? 13 : 14 }}
                    >
                      {label}
                    </Btn>
                  ))}
                </div>
                {isAdmin && pick.from_template === false && (
                  <Btn
                    disabled={busy}
                    onClick={() => doRemoveSession(pick)}
                    style={{ width: '100%', padding: '9px 0', fontSize: 12.5, marginTop: 8, color: C.danger }}
                  >
                    이 수업 지우기 (직접 추가한 수업)
                  </Btn>
                )}
                </div>
              )
            })()}
            {pick.status === '결강' && (
              <div style={{ marginTop: 14, padding: 12, background: C.pkl, borderRadius: 9, fontSize: 12.5, lineHeight: 1.6 }}>
                {pick.needs_makeup ? (
                  <>
                    아직 보강이 잡히지 않았습니다.
                    {isAdmin && (
                      <Btn
                        variant="primary"
                        disabled={busy}
                        onClick={() => {
                          setMakeupFor(pick)
                          setPick(null)
                        }}
                        style={{ width: '100%', marginTop: 9, padding: '10px 0' }}
                      >
                        보강 날짜 잡기
                      </Btn>
                    )}
                  </>
                ) : (
                  '보강이 연결되어 있습니다.'
                )}
              </div>
            )}
            <Btn onClick={() => setPick(null)} style={{ width: '100%', marginTop: 14, padding: '11px 0' }}>
              닫기
            </Btn>
          </div>
        </Modal>
      )}

      {ttPrint && isAdmin && (
        <TimetablePrint
          ym={ym}
          staff={staff}
          sessions={monthSessions}
          outside={outside}
          ownerName={staff.find((x) => x.role === 'admin')?.name}
          loadHolidays={loadHolidays}
          toneOf={toneOf}
          colorOf={colorOf}
          onlyTeacher={filter}
          onClose={() => setTtPrint(false)}
        />
      )}

      {editStudent && isAdmin && (
        <StudentModal
          student={editStudent === 'new' ? null : editStudent}
          staff={staff}
          busy={busy}
          onClose={() => setEditStudent(null)}
          onRemove={async (id) => {
            setEditStudent(null)
            setBusy(true)
            try {
              const msg = await removeStudent(id)
              say(msg || '삭제했습니다')
              await reloadAll()
            } catch (e) {
              fail(e)
            }
            setBusy(false)
          }}
          onSave={async (v, leaveFrom) => {
            const id = editStudent === 'new' ? null : editStudent.id
            setEditStudent(null)
            setBusy(true)
            try {
              if (id && leaveFrom) {
                // 퇴소·휴원: 그날부터의 시간표·회차만 정리 (그 전 기록은 그대로)
                const { status, ...rest } = v
                await saveStudent(id, rest)
                let msg
                try {
                  msg = await setStudentStatus(id, status, leaveFrom)
                } catch (err) {
                  const m = String(err?.message || err)
                  if (/set_student_status|function|찾을 수 없|not exist|schema cache/i.test(m)) {
                    throw new Error(
                      '퇴소·휴원 처리 기능이 DB에 아직 없습니다.\n' +
                        'Supabase SQL Editor에서 schema_v2.sql 을 먼저 실행한 뒤 다시 해주세요.\n' +
                        '(아동 이름·담당 등 나머지 수정은 저장됐습니다)'
                    )
                  }
                  throw err
                }
                say(msg || '바꿨습니다')
              } else {
                await saveStudent(id, v)
                say(id ? '수정했습니다' : '등록했습니다')
              }
              await reloadAll()
            } catch (e) {
              fail(e)
            }
            setBusy(false)
          }}
        />
      )}

      {receiptFor && (
        <ReceiptModal
          ym={ym}
          student={receiptFor}
          receipt={receipts.find((r) => r.student_id === receiptFor.id)}
          extra={receiptExtras.find((x) => x.student_id === receiptFor.id)}
          busy={busy}
          onClose={() => setReceiptFor(null)}
          onIssue={async (sid, amount, reason) => {
            setBusy(true)
            try {
              await issueReceipt(ym, sid)
              if (amount || reason) await saveAdjust(ym, sid, amount, reason)
              say('발행했습니다')
              await reloadMonth()
              setReceiptFor(null)
            } catch (e) {
              fail(e)
            }
            setBusy(false)
          }}
          onUnlock={async (sid) => {
            setBusy(true)
            try {
              await unlockReceipt(ym, sid)
              say('잠금을 해제했습니다')
              await reloadMonth()
            } catch (e) {
              fail(e)
            }
            setBusy(false)
          }}
        />
      )}

      {printAll && (
        <PrintAll ym={ym} students={printAll} receipts={receipts} extras={receiptExtras} say={say} onClose={() => setPrintAll(null)} />
      )}

      <Toast msg={toast?.msg} tone={toast?.tone} />
    </div>
  )
}

/* ---------------- 설정 누락 안내 ---------------- */
function SetupNeeded() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: C.bg }}>
      <Card style={{ padding: 26, maxWidth: 400 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>설정이 하나 빠졌습니다</div>
        <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.75 }}>
          Supabase 연결 키가 등록되지 않았습니다. GitHub 저장소에서 아래를 추가한 뒤 다시 배포해 주세요.
          <div style={{ marginTop: 12, padding: 12, background: '#F7F8F9', borderRadius: 8, fontSize: 12.5, color: C.ink, lineHeight: 1.8 }}>
            Settings › Secrets and variables › Actions › New repository secret
            <div style={{ marginTop: 6, fontWeight: 700 }}>이름: VITE_SUPABASE_ANON_KEY</div>
            <div style={{ fontWeight: 700 }}>값: Supabase anon public key</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ---------------- 로그인 ---------------- */
function Login({ say }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    try {
      await signIn(email.trim(), pw)
    } catch (e) {
      say(e.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않습니다' : e.message, 'err')
    }
    setBusy(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: C.bg }}>
      <Card style={{ padding: 28, width: '100%', maxWidth: 340 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.pkd, textAlign: 'center' }}>검단ABA</div>
        <div style={{ fontSize: 13, color: C.sub, textAlign: 'center', marginTop: 4, marginBottom: 22 }}>
          수업 시간표
        </div>
        <input
          placeholder="이메일"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', fontSize: 14, padding: '11px 12px', border: '1px solid #DEE0E3', borderRadius: 8, marginBottom: 8 }}
        />
        <input
          placeholder="비밀번호"
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          style={{ width: '100%', fontSize: 14, padding: '11px 12px', border: '1px solid #DEE0E3', borderRadius: 8, marginBottom: 14 }}
        />
        <Btn variant="primary" disabled={busy || !email || !pw} onClick={go} style={{ width: '100%', padding: '12px 0', fontSize: 15 }}>
          {busy ? '로그인 중…' : '로그인'}
        </Btn>
      </Card>
    </div>
  )
}

domainGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
