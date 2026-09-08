import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import { createPortal } from 'react-dom'
import { createClient } from '@supabase/supabase-js'


/* ═════════════════ db.js ═════════════════ */

const URL = 'https://vdubgrxwijydwfabwpnk.supabase.co'
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const hasKey = !!ANON

// 키가 없으면 createClient 가 예외를 던져 앱이 통째로 죽습니다.
// 빈 화면 대신 안내를 띄우려고 더미 키로 만들어 둡니다.
const supabase = createClient(URL, ANON || 'missing-anon-key', {
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

async function loadUnconfirmed() {
  return ok(await supabase.from('v_unconfirmed').select('*'))
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

async function loadClosings(ym) {
  return ok(await supabase.from('v_closing_status').select('*').eq('ym', ym))
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
async function adminSetStatus(id, status) {
  return ok(await supabase.from('sessions').update({ status, marked_at: new Date().toISOString() }).eq('id', id))
}

// 보강 세션 생성
async function createMakeup(absent, { d, start_time, end_time }) {
  return ok(
    await supabase.from('sessions').insert({
      d,
      start_time,
      end_time,
      student_id: absent.student_id,
      staff_id: absent.staff_id,
      program_code: absent.program_code,
      status: '보강',
      makeup_for: absent.id,
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

async function saveStudent(id, v) {
  if (id) return ok(await supabase.from('students').update(v).eq('id', id))
  return ok(await supabase.from('students').insert(v))
}

async function saveTemplate(v) {
  return ok(await supabase.from('schedule_templates').insert(v))
}

// 시간표 삭제
//   출결을 한 번도 안 찍었으면 회차까지 완전히 지우고,
//   이미 진행한 게 있으면 그 기록만 남기고 종료합니다.
async function endTemplate(id) {
  return ok(await supabase.rpc('remove_template', { p_id: id }))
}

async function addHoliday(d, label) {
  return ok(await supabase.from('holidays').upsert({ d, label }))
}

async function removeHoliday(d) {
  return ok(await supabase.from('holidays').delete().eq('d', d))
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
}

const STATUS = {
  진행: { bg: '#EDF7F1', bd: '#BFE3CE', fg: '#1F5B3A' },
  미확인: { bg: '#FFFFFF', bd: '#E3E5E8', fg: '#6B7280' },
  결강완: { bg: '#FEF6E7', bd: '#F0D49B', fg: '#8A5A00' },
  미보강: { bg: '#FDECEF', bd: '#F3AFBD', fg: '#AE2340' },
  보강: { bg: '#EEF3FD', bd: '#C3D4F2', fg: '#254B8C' },
  취소: { bg: '#F4F4F5', bd: '#E4E4E7', fg: '#A1A1AA' },
}

const TEACHER_COLORS = ['#D4728A', '#4A7FD4', '#2E9E8F', '#9B72C4', '#C98A3A', '#5C8A3A']

function styleOf(s) {
  if (s.status === '결강') return s.needs_makeup ? STATUS.미보강 : STATUS.결강완
  if (s.status === '진행' && !s.confirmed) return STATUS.미확인
  return STATUS[s.status] || STATUS.미확인
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
const DAY_END = 1200 // 20:00
const PX = 1.02

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 시간이 겹치는 수업을 가로로 나눠 배치
function layout(items) {
  const sorted = [...items].sort(
    (a, b) => toMin(a.start_time) - toMin(b.start_time) || toMin(a.end_time) - toMin(b.end_time)
  )
  const groups = []
  let cur = []
  let curEnd = -1
  sorted.forEach((s) => {
    if (cur.length && toMin(s.start_time) >= curEnd) {
      groups.push(cur)
      cur = []
      curEnd = -1
    }
    cur.push(s)
    curEnd = Math.max(curEnd, toMin(s.end_time))
  })
  if (cur.length) groups.push(cur)

  const out = []
  groups.forEach((g) => {
    const colEnd = []
    const placed = []
    g.forEach((s) => {
      let c = colEnd.findIndex((e) => toMin(s.start_time) >= e)
      if (c === -1) {
        c = colEnd.length
        colEnd.push(toMin(s.end_time))
      } else colEnd[c] = toMin(s.end_time)
      placed.push({ s, col: c })
    })
    placed.forEach((p) => out.push({ ...p, cols: colEnd.length }))
  })
  return out
}

function WeekGrid({ weekStart, sessions, holidays, colorOf, onPick, today }) {
  const days = useMemo(
    () =>
      [...Array(6)].map((_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return d
      }),
    [weekStart]
  )

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.d)), [holidays])
  const height = (DAY_END - DAY_START) * PX

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(6, 1fr)' }}>
        <div style={{ borderBottom: `1px solid ${C.line}`, background: '#FBFBFC' }} />
        {days.map((d, i) => {
          const isToday = isoOf(d) === today
          return (
            <div
              key={i}
              style={{
                padding: '8px 0',
                textAlign: 'center',
                borderLeft: `1px solid ${C.line2}`,
                borderBottom: `1px solid ${C.line}`,
                background: isToday ? C.pkl : '#FBFBFC',
              }}
            >
              <div style={{ fontSize: 10.5, color: C.mut }}>{'일월화수목금토'[d.getDay()]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? C.pkd : C.ink }}>
                {d.getDate()}
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
          const isHoliday = holidaySet.has(ds)
          const items = sessions.filter((s) => s.d === ds)
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                height,
                borderLeft: `1px solid ${C.line2}`,
                background: isHoliday ? '#FAFAFB' : '#fff',
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
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: '#B4B8BD',
                  }}
                >
                  휴원
                </div>
              )}
              {layout(items).map(({ s, col, cols }) => {
                const st = styleOf(s)
                const tc = colorOf(s.staff_name)
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
                      background: st.bg,
                      border: `1px solid ${st.bd}`,
                      borderLeft: `3px solid ${tc}`,
                      borderRadius: 5,
                      padding: narrow ? '2px 3px' : '3px 5px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      display: 'block',
                    }}
                  >
                    <div
                      style={{
                        fontSize: narrow ? 10.5 : 12,
                        fontWeight: 700,
                        color: st.fg,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.student_name}
                    </div>
                    {h > 44 && !narrow && (
                      <div style={{ fontSize: 10, color: st.fg, opacity: 0.75 }}>
                        {hhmm(s.start_time)}
                      </div>
                    )}
                    {h > 40 && narrow && (
                      <div style={{ fontSize: 9, color: st.fg, opacity: 0.7, whiteSpace: 'nowrap' }}>
                        {(s.staff_name || '').slice(-2)}
                      </div>
                    )}
                    {s.status === '결강' && h > 52 && (
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: st.fg }}>
                        {s.needs_makeup ? '미보강' : '보강완료'}
                      </div>
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

      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 9, lineHeight: 1.6 }}>
        수업이 정상 진행됐으면 아무것도 안 하셔도 됩니다.{' '}
        <b style={{ color: C.danger }}>결강이나 취소일 때만</b> 눌러주세요.
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {today.length === 0 ? (
          <Empty>오늘 수업이 없습니다.</Empty>
        ) : (
          today.map((s) => {
            const st = STATUS[s.status] || STATUS.미확인
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
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {['결강', '취소'].map((k) => {
                    const on = s.status === k
                    return (
                      <Btn
                        key={k}
                        disabled={busy}
                        variant={on ? 'primary' : 'default'}
                        onClick={() => onMark(s.id, on ? '진행' : k)}
                        style={{ flex: 1, padding: '10px 0' }}
                      >
                        {on ? `${k} 취소하기` : k}
                      </Btn>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}

function MyClosingView({ ym, summary, closing, onSubmit, busy }) {
  const blocked = (summary?.unconfirmed || 0) > 0
  const st = closing?.status
  const done = st === '제출' || st === '승인'

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <Card style={{ padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 마감</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
          {st === '요청' ? '원장님이 마감을 요청하셨습니다.' : '한 달 수업을 확인하고 제출하세요.'}
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
          <Stat label="총 회차" value={`${summary?.total_count ?? 0}건`} />
          <Stat label="결강" value={`${summary?.absent_count ?? 0}건`} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <Stat label="시수" value={`${((summary?.total_minutes ?? 0) / 60).toFixed(1)}h`} />
          <Stat label="취소" value={`${summary?.cancel_count ?? 0}건`} />
        </div>

        {blocked && (
          <div
            style={{
              padding: '11px 13px',
              background: '#FDECEF',
              borderRadius: 9,
              fontSize: 12.5,
              color: C.danger,
              fontWeight: 600,
              marginBottom: 12,
              lineHeight: 1.6,
            }}
          >
            아직 확인 안 한 수업이 {summary.unconfirmed}건 있습니다. 주간 화면에서 모두 확인해야 제출할 수
            있어요.
          </div>
        )}

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

        <Btn
          variant="primary"
          disabled={blocked || done || busy}
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
function BillingView({ ym, lines, receipts, onOpenReceipt, onPrintAll }) {
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

  const rMap = useMemo(() => Object.fromEntries(receipts.map((r) => [r.student_id, r])), [receipts])
  const total = byStudent.reduce((a, b) => a + b.subtotal + (rMap[b.id]?.adjustment || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 정산</div>
        <div style={{ fontSize: 12, color: C.sub }}>(진행 + 결강) × 회당 단가</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn onClick={() => onPrintAll(byStudent)} disabled={byStudent.length === 0}>
            영수증 {byStudent.length}장 인쇄
          </Btn>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.pkd }}>{won(total)}원</div>
        </div>
      </div>

      <Card style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
          <thead>
            <tr style={{ background: '#FBFBFC', color: C.sub }}>
              {['아동', '수업명', '선생님별', '횟수', '단가', '금액', '미보강', '영수증'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '9px 12px',
                    textAlign: i >= 3 && i <= 6 ? 'right' : 'left',
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
            {byStudent.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Empty>이 달 수업 기록이 없습니다. 먼저 회차를 생성하세요.</Empty>
                </td>
              </tr>
            )}
            {byStudent.map((s) =>
              s.lines.map((l, i) => (
                <tr
                  key={l.student_id + l.program_code}
                  style={{
                    borderBottom: i === s.lines.length - 1 ? `1px solid ${C.line}` : 'none',
                    background: i > 0 ? '#FCFCFD' : '#fff',
                  }}
                >
                  {i === 0 && (
                    <td
                      rowSpan={s.lines.length}
                      style={{
                        padding: '9px 12px',
                        fontWeight: 700,
                        verticalAlign: 'top',
                        borderRight: s.lines.length > 1 ? `2px solid ${C.pkl}` : 'none',
                      }}
                    >
                      <button
                        onClick={() => onOpenReceipt(s)}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          font: 'inherit',
                          fontWeight: 700,
                          cursor: 'pointer',
                          borderBottom: '1px dashed #C9CCD1',
                        }}
                      >
                        {s.name}
                      </button>
                    </td>
                  )}
                  <td style={{ padding: '9px 12px', color: '#4B5057', paddingLeft: i > 0 ? 22 : 12 }}>
                    {i > 0 && <span style={{ color: C.mut, marginRight: 5 }}>↳</span>}
                    {l.program_label}
                  </td>
                  <td style={{ padding: '9px 12px', color: C.mut, fontSize: 12 }}>{l.staff_summary}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{l.lesson_count}회</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: C.sub }}>{won(l.unit_price)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{won(l.amount)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {l.unmade_up > 0 ? (
                      <span style={{ color: C.danger, fontWeight: 700 }}>{l.unmade_up}</span>
                    ) : (
                      <span style={{ color: '#C9CCD1' }}>—</span>
                    )}
                  </td>
                  {i === 0 && (
                    <td rowSpan={s.lines.length} style={{ padding: '9px 12px', verticalAlign: 'top' }}>
                      {rMap[s.id]?.locked ? <Pill tone="green">발행됨</Pill> : <Pill>미발행</Pill>}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <div style={{ marginTop: 10, fontSize: 12, color: C.sub }}>
        아동 이름을 누르면 영수증이 열립니다.
      </div>
    </div>
  )
}

/* ---------------- 영수증 ---------------- */
function ReceiptModal({ ym, student, receipt, onClose, onIssue, onUnlock, onSaveAdjust, busy }) {
  const [amount, setAmount] = useState(receipt?.adjustment || 0)
  const [reason, setReason] = useState(receipt?.adjust_reason || '')
  const locked = !!receipt?.locked
  const total = student.subtotal + (Number(amount) || 0)
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
                    <div style={{ fontSize: 11, color: C.mut }}>{l.staff_summary}</div>
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
          <div style={{ fontSize: 14, fontWeight: 700 }}>합계</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.pkd }}>{won(total)}원</div>
        </div>

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
function ClosingView({ ym, rows, staff, onRequest, onReview, busy }) {
  const [copied, setCopied] = useState(false)
  const map = Object.fromEntries(rows.map((r) => [r.staff_name, r]))

  const copyMsg = () => {
    const lines = staff
      .filter((s) => s.active)
      .map((s) => {
        const r = map[s.name]
        const u = r?.unconfirmed ?? 0
        return `· ${s.name} 선생님 — 미확인 ${u}건`
      })
    const msg = `[검단ABA] ${ym.replace('-', '년 ')}월 마감 요청\n\n출결 확인 부탁드립니다.\n앱 > 마감 탭에서 제출해 주세요.\n\n${lines.join('\n')}\n\n확인 안 된 수업이 있으면 제출이 안 됩니다.`
    navigator.clipboard?.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{ym.replace('-', '년 ')}월 마감</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <Btn disabled={busy} onClick={() => onRequest(null)}>
            전원 마감 요청
          </Btn>
          <Btn onClick={copyMsg}>{copied ? '복사됨 — 단톡방에 붙여넣으세요' : '요청 문구 복사'}</Btn>
        </div>
      </div>

      <Card style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ background: '#FBFBFC', color: C.sub }}>
              {['선생님', '상태', '회차', '결강', '시수', '미확인', '미보강', ''].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '9px 12px',
                    textAlign: i >= 2 && i <= 6 ? 'right' : 'left',
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
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{s.name}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <Pill tone={tone}>{st}</Pill>
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
                        color: r?.unconfirmed ? C.danger : '#C9CCD1',
                        fontWeight: r?.unconfirmed ? 700 : 400,
                      }}
                    >
                      {r?.unconfirmed || '—'}
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
                          요청
                        </Btn>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </Card>
      <div style={{ marginTop: 10, fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
        승인하면 그 선생님의 해당 월 출결이 잠깁니다. 뒤늦게 고칠 일이 생기면 잠금을 해제하세요.
      </div>
    </div>
  )
}


/* ═════════════════ ManageViews.jsx ═════════════════ */

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/* ================= 보강 날짜 잡기 ================= */
function MakeupModal({ absent, staffId, onClose, onSave, busy }) {
  const [date, setDate] = useState('')
  const [start, setStart] = useState(hhmm(absent.start_time))
  const [conflicts, setConflicts] = useState([])
  const [checking, setChecking] = useState(false)

  const mins = minutesBetween(absent.start_time, absent.end_time)
  const end = useMemo(() => {
    if (!start) return ''
    const [h, m] = start.split(':').map(Number)
    const t = h * 60 + m + mins
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }, [start, mins])

  // 그날 담당 선생님 일정을 불러와 겹치는지 미리 확인
  useEffect(() => {
    if (!date) {
      setConflicts([])
      return
    }
    let alive = true
    setChecking(true)
    loadSessions(date, date)
      .then((rows) => {
        if (!alive) return
        const mine = rows.filter((r) => r.staff_id === (staffId || absent.staff_id) && r.status !== '취소')
        const a = start
        const b = end
        setConflicts(mine.filter((r) => a < hhmm(r.end_time) && b > hhmm(r.start_time)))
        setChecking(false)
      })
      .catch(() => setChecking(false))
    return () => {
      alive = false
    }
  }, [date, start, end, staffId, absent.staff_id])

  const bad = conflicts.length > 0
  const dow = date ? DOW[new Date(date + 'T00:00:00').getDay()] : ''

  return (
    <Modal onClose={onClose} max={400}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>보강 날짜 잡기</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
          {absent.student_name} · {absent.d.slice(5).replace('-', '/')} 결강분 · {mins}분
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>보강할 날짜</div>
        <input
          type="date"
          value={date}
          min={absent.d}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: '100%', fontSize: 14, padding: '10px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
        />
        {dow && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 5 }}>{dow}요일</div>}

        <div style={{ fontSize: 12, color: C.sub, margin: '14px 0 6px' }}>시작 시각</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <input
            type="time"
            value={start}
            step={600}
            onChange={(e) => setStart(e.target.value)}
            style={{ fontSize: 14, padding: '10px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
          />
          <span style={{ fontSize: 13, color: C.sub }}>~ {end || '—'}</span>
        </div>

        {date && (
          <div
            style={{
              marginTop: 14,
              padding: '11px 13px',
              borderRadius: 9,
              background: bad ? '#FDECEF' : '#EDF7F1',
              fontSize: 12.5,
              lineHeight: 1.65,
              color: bad ? C.danger : '#1F5B3A',
              fontWeight: 600,
            }}
          >
            {checking
              ? '확인 중…'
              : bad
                ? `${absent.staff_name} 선생님이 그 시간에 수업이 있습니다 — ${conflicts
                    .map((c) => `${c.student_name} ${hhmm(c.start_time)}`)
                    .join(', ')}`
                : '그 시간은 비어 있습니다.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 16 }}>
          <Btn
            variant="primary"
            disabled={!date || !start || bad || busy || checking}
            onClick={() => onSave({ d: date, start_time: start, end_time: end })}
            style={{ flex: 1, padding: '12px 0', fontSize: 14.5 }}
          >
            보강 등록
          </Btn>
          <Btn onClick={onClose} style={{ flex: 1, padding: '12px 0' }}>
            취소
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

/* ================= 휴원일 ================= */
function HolidayView({ holidays, onAdd, onRemove, busy }) {
  const [d, setD] = useState('')
  const [label, setLabel] = useState('')

  return (
    <div style={{ maxWidth: 520 }}>
      <Card style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>휴원일 등록</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 13, lineHeight: 1.6 }}>
          공휴일이나 센터 사정으로 쉬는 날입니다. 등록한 뒤 정산 탭에서 <b>회차 생성</b>을 다시 누르면 그날
          수업이 빠집니다. 이미 출결을 찍은 회차는 지워지지 않습니다.
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={d}
            onChange={(e) => setD(e.target.value)}
            style={{ fontSize: 14, padding: '9px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
          />
          <input
            placeholder="추석, 개천절 등"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ flex: 1, minWidth: 130, fontSize: 14, padding: '9px 11px', border: '1px solid #DEE0E3', borderRadius: 8 }}
          />
          <Btn
            variant="primary"
            disabled={!d || busy}
            onClick={() => {
              onAdd(d, label)
              setD('')
              setLabel('')
            }}
          >
            추가
          </Btn>
        </div>
      </Card>

      <Card style={{ overflow: 'hidden' }}>
        {holidays.length === 0 ? (
          <Empty>등록된 휴원일이 없습니다.</Empty>
        ) : (
          holidays.map((h) => (
            <div
              key={h.d}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${C.line2}` }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, minWidth: 104 }}>
                {h.d} ({DOW[new Date(h.d + 'T00:00:00').getDay()]})
              </div>
              <div style={{ fontSize: 13, color: C.sub, flex: 1 }}>{h.label || '—'}</div>
              <Btn disabled={busy} onClick={() => onRemove(h.d)} style={{ padding: '5px 11px', fontSize: 12 }}>
                삭제
              </Btn>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

/* ================= 아동 · 시간표 ================= */
function StudentsView({
  students,
  templates,
  staff,
  programs,
  busy,
  onSaveStudent,
  onSaveTemplate,
  onEndTemplate,
}) {
  const [editing, setEditing] = useState(null) // student or 'new'
  const [adding, setAdding] = useState(null) // student for new template

  const tmplOf = (sid) => templates.filter((t) => t.student_id === sid && !t.valid_to)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>아동 {students.filter((s) => s.status === '재원').length}명</div>
        <Btn variant="primary" style={{ marginLeft: 'auto' }} onClick={() => setEditing('new')}>
          새 아동 등록
        </Btn>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {students.map((s) => {
          const ts = tmplOf(s.id)
          return (
            <div key={s.id} style={{ padding: '13px 16px', borderBottom: `1px solid ${C.line2}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</div>
                {s.status !== '재원' && <Pill tone="gray">{s.status}</Pill>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <Btn onClick={() => setAdding(s)} style={{ padding: '5px 11px', fontSize: 12 }}>
                    수업 추가
                  </Btn>
                  <Btn onClick={() => setEditing(s)} style={{ padding: '5px 11px', fontSize: 12 }}>
                    수정
                  </Btn>
                </div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ts.length === 0 && (
                  <span style={{ fontSize: 12, color: C.mut }}>등록된 수업이 없습니다</span>
                )}
                {ts.map((t) => (
                  <span
                    key={t.id}
                    style={{
                      fontSize: 12,
                      padding: '5px 9px',
                      borderRadius: 7,
                      background: '#F7F8F9',
                      border: `1px solid ${C.line}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    {DOW[t.weekday]} {hhmm(t.start_time)}
                    <span style={{ color: C.mut }}>
                      {staff.find((x) => x.id === t.staff_id)?.name} ·{' '}
                      {programs.find((p) => p.code === t.program_code)?.label}
                    </span>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `${s.name} — ${DOW[t.weekday]} ${hhmm(t.start_time)} 수업을 삭제할까요?\n\n` +
                              `· 아직 출결을 안 찍었으면 예정 회차까지 모두 지워집니다\n` +
                              `· 이미 진행한 회차가 있으면 그 기록은 남고 이후만 정리됩니다`
                          )
                        )
                          onEndTemplate(t.id)
                      }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.mut, fontSize: 14, padding: 0, lineHeight: 1 }}
                      title="이 수업 종료"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </Card>

      {editing && (
        <StudentModal
          student={editing === 'new' ? null : editing}
          staff={staff}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            onSaveStudent(editing === 'new' ? null : editing.id, v)
            setEditing(null)
          }}
        />
      )}

      {adding && (
        <TemplateModal
          student={adding}
          staff={staff}
          programs={programs}
          busy={busy}
          onClose={() => setAdding(null)}
          onSave={(v) => {
            onSaveTemplate({ ...v, student_id: adding.id })
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

function StudentModal({ student, staff, onClose, onSave, busy }) {
  const [name, setName] = useState(student?.name || '')
  const [display, setDisplay] = useState(student?.display_name || '')
  const [main, setMain] = useState(student?.main_staff_id || staff[0]?.id || '')
  const [status, setStatus] = useState(student?.status || '재원')

  return (
    <Modal onClose={onClose} max={370}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}`, fontSize: 17, fontWeight: 700 }}>
        {student ? '아동 수정' : '새 아동 등록'}
      </div>
      <div style={{ padding: 18 }}>
        <Field label="이름">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="김지환" />
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
        {status !== '재원' && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>
            재원이 아니면 다음 달부터 회차가 생성되지 않습니다. 이미 만들어진 회차는 그대로 남습니다.
          </div>
        )}
        <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
          <Btn
            variant="primary"
            disabled={!name.trim() || busy}
            onClick={() => onSave({ name: name.trim(), display_name: display.trim() || null, main_staff_id: main, status })}
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

function TemplateModal({ student, staff, programs, onClose, onSave, busy }) {
  const [staffId, setStaffId] = useState(student.main_staff_id || staff[0]?.id || '')
  const [pcode, setPcode] = useState(programs[0]?.code || '')
  const [wd, setWd] = useState(1)
  const [start, setStart] = useState('16:00')
  const [from, setFrom] = useState(isoOf(new Date()))

  const prog = programs.find((p) => p.code === pcode)
  const mins = prog?.minutes || 50
  const end = useMemo(() => {
    const [h, m] = start.split(':').map(Number)
    const t = h * 60 + m + mins
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }, [start, mins])

  return (
    <Modal onClose={onClose} max={370}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>수업 추가</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{student.name}</div>
      </div>
      <div style={{ padding: 18 }}>
        <Field label="선생님">
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={inp}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="프로그램">
          <select value={pcode} onChange={(e) => setPcode(e.target.value)} style={inp}>
            {programs.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="요일">
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Btn
                key={n}
                variant={wd === n ? 'primary' : 'default'}
                onClick={() => setWd(n)}
                style={{ flex: 1, padding: '9px 0', fontSize: 13.5 }}
              >
                {DOW[n]}
              </Btn>
            ))}
          </div>
        </Field>
        <Field label={`시작 시각 (${mins}분 수업)`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input type="time" step={600} value={start} onChange={(e) => setStart(e.target.value)} style={{ ...inp, width: 'auto' }} />
            <span style={{ fontSize: 13, color: C.sub }}>~ {end}</span>
          </div>
        </Field>
        <Field label="시작일 (이 날짜부터 적용)">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
        </Field>

        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
          저장한 뒤 정산 탭에서 <b>회차 생성</b>을 눌러야 실제 수업이 만들어집니다.
        </div>

        <div style={{ display: 'flex', gap: 7 }}>
          <Btn
            variant="primary"
            disabled={busy}
            onClick={() =>
              onSave({ staff_id: staffId, program_code: pcode, weekday: wd, start_time: start, end_time: end, valid_from: from })
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

const inp = {
  width: '100%',
  fontSize: 14,
  padding: '10px 11px',
  border: '1px solid #DEE0E3',
  borderRadius: 8,
  background: '#fff',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}


/* ═════════════════ PrintAll.jsx ═════════════════ */

/* 영수증 한 장 — 화면·인쇄 공용 */
function Sheet({ ym, s, adjustment, reason }) {
  const total = s.subtotal + (adjustment || 0)
  const hasAbsent = s.lines.some((l) => (l.absent_dates || []).length > 0)

  return (
    <div className="receipt-page">
      <div style={{ textAlign: 'center', borderBottom: `2px solid ${C.pk}`, paddingBottom: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.06em', color: C.pkd }}>
          수강료 영수증
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>{ym.replace('-', '년 ')}월</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{s.label || s.name}</div>
        <div style={{ fontSize: 11.5, color: C.mut }}>귀하</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ color: C.mut, fontSize: 11 }}>
            <th style={{ textAlign: 'left', padding: '0 0 5px', fontWeight: 600 }}>수업명</th>
            <th style={{ textAlign: 'right', padding: '0 0 5px', fontWeight: 600 }}>횟수</th>
            <th style={{ textAlign: 'right', padding: '0 0 5px', fontWeight: 600 }}>단가</th>
            <th style={{ textAlign: 'right', padding: '0 0 5px', fontWeight: 600 }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, i) => {
            const absent = new Set((l.absent_dates || []).map((d) => d.slice(-2)))
            return (
              <tr key={i} style={{ borderTop: `1px solid ${C.line2}` }}>
                <td style={{ padding: '8px 0' }}>
                  {l.program_label}
                  <div style={{ fontSize: 10.5, color: C.mut }}>{l.staff_summary}</div>
                  <div style={{ fontSize: 10.5, color: C.sub, marginTop: 2, lineHeight: 1.5 }}>
                    {(l.session_dates || []).map((d, k) => {
                      const dd = d.slice(-2)
                      const isAbsent = absent.has(dd)
                      return (
                        <span key={k} style={{ marginRight: 4, color: isAbsent ? C.danger : C.sub }}>
                          {Number(dd)}
                          {isAbsent ? '*' : ''}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', verticalAlign: 'top' }}>{l.lesson_count}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: C.sub, verticalAlign: 'top' }}>
                  {won(l.unit_price)}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>
                  {won(l.amount)}
                </td>
              </tr>
            )
          })}
          {!!adjustment && (
            <tr style={{ borderTop: `1px solid ${C.line2}` }}>
              <td colSpan={3} style={{ padding: '8px 0', color: C.danger }}>
                조정
                <div style={{ fontSize: 10.5, color: C.mut }}>{reason || '사유 없음'}</div>
              </td>
              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: C.danger }}>
                {won(adjustment)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1.5px solid ${C.ink}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>합계</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.pkd }}>{won(total)}원</div>
      </div>

      {hasAbsent && (
        <div style={{ marginTop: 7, fontSize: 10.5, color: C.sub, lineHeight: 1.55 }}>
          * 표시는 결강일입니다. 월정액이라 청구에 포함되며 보강해 드립니다.
        </div>
      )}

      <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12, color: '#4B5057', lineHeight: 1.85 }}>
        위 금액을 정히 영수합니다.
        <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4, color: C.ink }}>
          검단ABA언어행동연구소
        </div>
        <div style={{ fontSize: 10.5, color: C.mut }}>인천 검단구 이음1로 377 눈담봄 905호</div>
        <div style={{ fontWeight: 700, marginTop: 1, color: C.ink }}>대표 민다혜 (인)</div>
      </div>
    </div>
  )
}

function PrintAll({ ym, students, receipts, onClose }) {
  const rMap = useMemo(
    () => Object.fromEntries(receipts.map((r) => [r.student_id, r])),
    [receipts]
  )

  // 앱 본문은 인쇄 때 숨기므로, 영수증은 body 바로 아래에 붙입니다
  return createPortal(
    <div className="print-root">
      <style>{`
        .print-root {
          position: fixed;
          inset: 0;
          background: #fff;
          z-index: 100;
          overflow: auto;
        }
        .receipt-page {
          width: 148mm;
          min-height: 200mm;
          padding: 14mm 13mm;
          margin: 0 auto 10mm;
          background: #fff;
          border: 1px solid ${C.line};
          box-sizing: border-box;
        }
        @media print {
          @page { size: A5 portrait; margin: 0; }
          html, body { height: auto !important; overflow: visible !important; }
          /* 인쇄할 때는 fixed 를 풀어야 전체 장수가 출력됩니다 */
          .print-root {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
          }
          .no-print { display: none !important; }
          .print-wrap { background: #fff !important; padding: 0 !important; }
          .receipt-page {
            border: none;
            margin: 0;
            width: 148mm;
            min-height: 209mm;
            page-break-after: always;
            break-after: page;
          }
          .receipt-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          position: 'sticky',
          top: 0,
          background: '#fff',
          borderBottom: `1px solid ${C.line}`,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          zIndex: 2,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {ym.replace('-', '년 ')}월 영수증 {students.length}장
        </div>
        <div style={{ fontSize: 12, color: C.sub }}>A5 세로 · 한 장에 한 명</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <Btn variant="primary" onClick={() => window.print()}>
            인쇄 / PDF 저장
          </Btn>
          <Btn onClick={onClose}>닫기</Btn>
        </div>
      </div>

      <div
        className="no-print"
        style={{ padding: '12px 16px 0', fontSize: 12, color: C.sub, lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}
      >
        인쇄 창에서 <b>프린터를 "PDF로 저장"</b>으로 바꾸면 {students.length}장이 한 파일로 저장됩니다.
        용지는 A5, 여백은 "없음"으로 두세요.
      </div>

      <div className="print-wrap" style={{ padding: '16px 0', background: C.bg }}>
        {students.map((s) => (
          <Sheet
            key={s.id}
            ym={ym}
            s={s}
            adjustment={rMap[s.id]?.adjustment || 0}
            reason={rMap[s.id]?.adjust_reason}
          />
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

function App() {
  const [session, setSession] = useState(undefined)
  const [me, setMe] = useState(null)
  const [staff, setStaff] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)

  const [tab, setTab] = useState('today')
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [ym, setYm] = useState(() => ymOf(new Date()))

  const [sessions, setSessions] = useState([])
  const [holidays, setHolidays] = useState([])
  const [today, setToday] = useState([])
  const [unmadeUp, setUnmadeUp] = useState([])
  const [unconfirmed, setUnconfirmed] = useState([])
  const [billing, setBilling] = useState([])
  const [closings, setClosings] = useState([])
  const [receipts, setReceipts] = useState([])

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [pick, setPick] = useState(null)
  const [receiptFor, setReceiptFor] = useState(null)
  const [filter, setFilter] = useState(null)
  const [makeupFor, setMakeupFor] = useState(null)
  const [printAll, setPrintAll] = useState(null)
  const [students, setStudents] = useState([])
  const [templates, setTemplates] = useState([])
  const [programs, setPrograms] = useState([])
  const [allHolidays, setAllHolidays] = useState([])

  const say = (msg, tone) => {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 2600)
  }
  const fail = (e) => say(e?.message || String(e), 'err')

  const colorOf = useCallback(
    (name) => {
      const i = staff.findIndex((s) => s.name === name)
      return TEACHER_COLORS[i < 0 ? 0 : i % TEACHER_COLORS.length]
    },
    [staff]
  )

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
        setTab(isAdmin ? 'week' : 'today')
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
    const [t, u, c] = await Promise.all([loadToday(), loadUnmadeUp(), loadUnconfirmed()])
    setToday(t)
    setUnmadeUp(u)
    setUnconfirmed(c)
  }, [])

  const reloadMonth = useCallback(async () => {
    const [b, cl, r] = await Promise.all([
      isAdmin ? loadBilling(ym) : Promise.resolve([]),
      loadClosings(ym),
      isAdmin ? loadReceipts(ym) : Promise.resolve([]),
    ])
    setBilling(b)
    setClosings(cl)
    setReceipts(r)
  }, [ym, isAdmin])

  const reloadManage = useCallback(async () => {
    if (!isAdmin) return
    const [st, tp, pg, hd] = await Promise.all([
      loadStudents(),
      loadTemplates(),
      loadPrograms(),
      loadHolidays('2020-01-01', '2100-01-01'),
    ])
    setStudents(st)
    setTemplates(tp)
    setPrograms(pg)
    setAllHolidays(hd)
  }, [isAdmin])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth(), reloadManage()])
    } catch (e) {
      fail(e)
    }
    setLoading(false)
  }, [reloadWeek, reloadCommon, reloadMonth, reloadManage])

  useEffect(() => {
    if (session && staff.length) reloadAll()
  }, [session, staff.length, weekStart, ym])

  /* ---- 동작 ---- */
  const doMark = async (id, status) => {
    setBusy(true)
    try {
      if (isAdmin) await adminSetStatus(id, status)
      else await markAttendance(id, status)
      await Promise.all([reloadWeek(), reloadCommon(), reloadMonth()])
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
      say(`${n}건 생성됐습니다`)
      await reloadAll()
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  const myClosing = closings.find((c) => c.staff_name === me?.name)

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

  const tabs = [
    ...(isAdmin ? [] : [['today', '오늘']]),
    ['week', '주간'],
    ['makeup', `보강 ${unmadeUp.length}`],
    ...(isAdmin
      ? [
          ['unconfirmed', `미확인 ${unconfirmed.length}`],
          ['closing', '마감'],
          ['billing', '정산'],
          ['students', '아동'],
          ['holiday', '휴원일'],
        ]
      : [['myclose', '마감']]),
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg }} className={printAll ? 'app-hidden-on-print' : ''}>
      <div className="no-print" style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>검단ABA 시간표</div>

          <div style={{ display: 'flex', gap: 3, background: '#F2F3F5', padding: 3, borderRadius: 8, overflowX: 'auto' }}>
            {tabs.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: tab === k ? '#fff' : 'transparent',
                  color: tab === k ? C.ink : C.sub,
                  boxShadow: tab === k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
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

      <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        {loading && <Loading />}

        {!loading && tab === 'today' && (
          <TodayView today={today} weekMinutes={weekMinutes} onMark={doMark} busy={busy} />
        )}

        {!loading && tab === 'myclose' && (
          <MyClosingView
            ym={ym}
            summary={myClosing}
            closing={myClosing}
            busy={busy}
            onSubmit={async () => {
              setBusy(true)
              try {
                await submitClosing(ym)
                say('제출했습니다')
                await reloadMonth()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
          />
        )}

        {!loading && tab === 'week' && (
          <>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
              <Btn
                onClick={() => {
                  const d = new Date(weekStart)
                  d.setDate(d.getDate() - 7)
                  setWeekStart(d)
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
                  setWeekStart(d)
                }}
                style={{ padding: '6px 11px' }}
              >
                →
              </Btn>
              <Btn onClick={() => setWeekStart(mondayOf(new Date()))} style={{ padding: '6px 11px' }}>
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
              onPick={setPick}
              today={isoOf(new Date())}
            />

            <div style={{ display: 'flex', gap: 13, marginTop: 11, flexWrap: 'wrap', fontSize: 11, color: C.sub }}>
              {[
                ['미확인', STATUS.미확인],
                ['진행', STATUS.진행],
                ['결강·보강완료', STATUS.결강완],
                ['결강·미보강', STATUS.미보강],
                ['보강', STATUS.보강],
                ['취소', STATUS.취소],
              ].map(([l, s]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: s.bg, border: `1px solid ${s.bd}` }} />
                  {l}
                </span>
              ))}
            </div>
          </>
        )}

        {!loading && tab === 'makeup' && (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line2}` }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>보강해야 할 수업 {unmadeUp.length}건</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
                결강했지만 아직 보강 날짜가 안 잡힌 수업입니다. 월정액이라 수강료는 이미 받은 회차예요.
              </div>
            </div>
            {unmadeUp.length === 0 ? (
              <Empty>보강할 수업이 없습니다.</Empty>
            ) : (
              unmadeUp.map((s) => (
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

        {!loading && tab === 'unconfirmed' && isAdmin && (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line2}` }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>아무도 확인 안 한 수업 {unconfirmed.length}건</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
                지나간 날짜인데 선생님이 아무것도 안 누른 회차입니다. 청구는 정상으로 나가지만, 이 중에 결강이
                숨어 있으면 <b style={{ color: C.danger }}>보강 의무가 사라집니다.</b>
              </div>
            </div>
            {unconfirmed.length === 0 ? (
              <Empty>모두 확인됐습니다.</Empty>
            ) : (
              unconfirmed.slice(0, 60).map((s) => (
                <div
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 18px', borderBottom: `1px solid ${C.line2}`, flexWrap: 'wrap' }}
                >
                  <span style={{ width: 4, height: 22, borderRadius: 2, background: colorOf(s.staff_name) }} />
                  <div style={{ minWidth: 62, fontSize: 14, fontWeight: 700 }}>{s.student_name}</div>
                  <div style={{ fontSize: 12, color: C.sub, minWidth: 132 }}>
                    {s.d.slice(5).replace('-', '/')} ({s.weekday}) {hhmm(s.start_time)}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, minWidth: 58 }}>{s.staff_name}</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <Btn variant="ok" disabled={busy} onClick={() => doMark(s.id, '진행')} style={{ padding: '5px 11px', fontSize: 12 }}>
                      진행
                    </Btn>
                    <Btn variant="danger" disabled={busy} onClick={() => doMark(s.id, '결강')} style={{ padding: '5px 11px', fontSize: 12 }}>
                      결강
                    </Btn>
                  </div>
                </div>
              ))
            )}
          </Card>
        )}

        {!loading && tab === 'closing' && isAdmin && (
          <ClosingView
            ym={ym}
            rows={closings}
            staff={staff}
            busy={busy}
            onRequest={async (sid) => {
              setBusy(true)
              try {
                const n = await requestClosing(ym, sid)
                say(`${n}명에게 요청했습니다`)
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
        )}

        {!loading && tab === 'billing' && isAdmin && (
          <>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                value={ym}
                onChange={(e) => setYm(e.target.value)}
                placeholder="2026-09"
                style={{ width: 108, fontSize: 13, padding: '7px 10px', border: '1px solid #DEE0E3', borderRadius: 7, fontWeight: 600 }}
              />
              <Btn disabled={busy} onClick={doGenerate}>
                이 달 회차 생성
              </Btn>
            </div>
            <BillingView
              ym={ym}
              lines={billing}
              receipts={receipts}
              onOpenReceipt={setReceiptFor}
              onPrintAll={setPrintAll}
            />
          </>
        )}

        {!loading && tab === 'students' && isAdmin && (
          <StudentsView
            students={students}
            templates={templates}
            staff={staff}
            programs={programs}
            busy={busy}
            onSaveStudent={async (id, v) => {
              setBusy(true)
              try {
                await saveStudent(id, v)
                say('저장했습니다')
                await reloadManage()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
            onSaveTemplate={async (v) => {
              setBusy(true)
              try {
                await saveTemplate(v)
                say('수업을 추가했습니다. 정산 탭에서 회차 생성을 눌러주세요')
                await reloadManage()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
            onEndTemplate={async (id) => {
              setBusy(true)
              try {
                const msg = await endTemplate(id)
                say(msg || '수업을 삭제했습니다')
                await reloadAll()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
          />
        )}

        {!loading && tab === 'holiday' && isAdmin && (
          <HolidayView
            holidays={allHolidays}
            busy={busy}
            onAdd={async (d, label) => {
              setBusy(true)
              try {
                await addHoliday(d, label)
                say('등록했습니다. 회차 생성을 다시 눌러주세요')
                await reloadManage()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
            onRemove={async (d) => {
              setBusy(true)
              try {
                await removeHoliday(d)
                say('삭제했습니다')
                await reloadManage()
              } catch (e) {
                fail(e)
              }
              setBusy(false)
            }}
          />
        )}
      </div>

      {makeupFor && (
        <MakeupModal
          absent={makeupFor}
          busy={busy}
          onClose={() => setMakeupFor(null)}
          onSave={async (v) => {
            setBusy(true)
            try {
              await createMakeup(makeupFor, v)
              say('보강을 등록했습니다')
              await Promise.all([reloadWeek(), reloadCommon(), reloadMonth()])
              setMakeupFor(null)
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
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>출결</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(isAdmin ? ['진행', '결강', '취소', '보강'] : ['진행', '결강', '취소']).map((st) => (
                <Btn
                  key={st}
                  variant={pick.status === st ? 'primary' : 'default'}
                  disabled={busy}
                  onClick={() => doMark(pick.id, st)}
                  style={{ flex: 1, padding: '11px 0', fontSize: 14 }}
                >
                  {st}
                </Btn>
              ))}
            </div>
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

      {receiptFor && (
        <ReceiptModal
          ym={ym}
          student={receiptFor}
          receipt={receipts.find((r) => r.student_id === receiptFor.id)}
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
        <PrintAll ym={ym} students={printAll} receipts={receipts} onClose={() => setPrintAll(null)} />
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
