import { createContext, useContext } from 'react';
import { supabase } from '../lib/supabaseClient';

// ============================================================
//  DATA STORE
//  Hydrates the migrated tables into a `data` object whose shape matches the
//  prototype (camelCase keys), so migrated component JSX that reads
//  `data.membershipPlans`, `member.joinDate`, etc. works unchanged.
//
//  RLS does the per-role filtering: an owner's fetch returns everything, a
//  client's returns only their own rows. Writes live in the per-entity
//  modules (data/plans.js, …) and call refresh() to re-sync.
//
//  As each phase migrates a slice, add its table to fetchAll() + a mapper.
// ============================================================

export const EMPTY = { members: [], membershipPlans: [], memberships: [], profiles: [], exercises: [], workouts: [], programs: [], personalPrograms: [], workoutLogs: [], bodyComp: [], roles: [], payments: [], expenses: [], communications: [], memberPrograms: [], balanceItems: [], categories: [], taxes: [], taxRemittances: [], segments: [], checkIns: [] };

// ---- Row → camelCase mappers (DB snake_case → prototype shape) ----
export function mapMemberRow(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? '',
    joinDate: r.join_date,
    status: r.status,
    credits: r.credits ?? 0,
    points: r.points ?? 0,
    photo: r.photo,
    photoUrl: r.photo_url,
    segment: r.segment,
    guardianId: r.guardian_id ?? null,
    birthDate: r.birth_date ?? '',
    address: r.address ?? '',
    emergencyContact: r.emergency_contact ?? { name: '', relation: '', phone: '' },
    notes: r.notes ?? '',
    goals: r.goals ?? [],
    paymentMethods: r.payment_methods ?? [],
    stripeCustomerId: r.stripe_customer_id ?? null,
    hasNutrition: r.has_nutrition ?? false,
  };
}

export function mapPlanRow(r) {
  return {
    id: r.id,
    name: r.name,
    segment: r.segment,
    mode: r.mode,
    sessionsPerWeek: r.sessions_per_week ?? 0,
    price: Number(r.price),
    recurrence: r.recurrence,
    intervalUnit: r.interval_unit ?? null,   // 'day'|'week'|'month', custom only
    intervalCount: r.interval_count ?? null,
    billingCycles: r.billing_cycles ?? null,  // null = runs until cancelled
    freeTrialDays: r.free_trial_days ?? 0,
    minCommitmentMonths: r.min_commitment_months ?? 0,
    paymentMethods: r.payment_methods ?? [],
    description: r.description ?? '',
    listed: r.listed,
    content: Array.isArray(r.content) ? r.content : [],
  };
}

export function mapMembershipRow(r) {
  return {
    id: r.id,
    memberId: r.member_id,
    planId: r.plan_id,
    startDate: r.start_date,
    nextBilling: r.next_billing,
    status: r.status,
    upfrontPaid: r.upfront_paid,
    trialEnd: r.trial_end,
    customPrice: r.custom_price != null ? Number(r.custom_price) : null,
    courtesy: r.courtesy ?? false,
    customMinMonths: r.custom_min_months,
    discount: r.discount,
    notes: r.notes ?? '',
    pause: r.pause,
    cancelAt: r.cancel_at ?? null,
    endDate: r.end_date ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
    stripeStatus: r.stripe_status ?? null,
  };
}

export function mapProfileRow(r) {
  return { id: r.id, email: r.email, name: r.name, role: r.role, memberId: r.member_id };
}

export function mapExerciseRow(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category ?? '',
    sections: r.sections ?? ['Strength'],
    measure: r.measure ?? 'reps',
    measures: (Array.isArray(r.measures) && r.measures.length) ? r.measures : [r.measure ?? 'reps'],
    logMetrics: (Array.isArray(r.log_metrics) && r.log_metrics.length) ? r.log_metrics : null,
    graphMetric: r.graph_metric ?? null,
    unit: r.unit ?? '',
    units: r.units && typeof r.units === 'object' ? r.units : (r.unit && r.measure !== 'reps' ? { [r.measure]: r.unit } : {}),
    isTest: r.is_test ?? false,
    videoUrl: r.video_url ?? '',
    equipment: r.equipment ?? '',
    regressionId: r.regression_id ?? '',
    progressionId: r.progression_id ?? '',
    oneRmSourceId: r.one_rm_source_id ?? '',
    timeLowerIsBetter: r.time_lower_is_better ?? true,
    tracksPR: r.tracks_pr ?? true,
  };
}

export function mapWorkoutRow(r) {
  return {
    id: r.id,
    name: r.name,
    focus: r.focus ?? '',
    difficulty: r.difficulty ?? 'Beginner',
    items: r.items ?? [],
    closingMessage: r.closing_message ?? '',
    shortLabel: r.short_label ?? '',
  };
}

export function mapProgramRow(r) {
  return {
    id: r.id,
    name: r.name,
    mode: r.mode ?? 'in-person',
    durationWeeks: r.duration_weeks ?? 4,
    focus: r.focus ?? '',
    description: r.description ?? '',
    schedule: r.schedule ?? [],
    price: Number(r.price ?? 0),
    pricingType: r.pricing_type ?? 'one-time',
    listed: r.listed ?? false,
    tagline: r.tagline ?? '',
    equipment: r.equipment ?? '',
    forSegment: r.for_segment ?? 'all',
    content: Array.isArray(r.content) ? r.content : [],
  };
}


export function mapPersonalProgramRow(r) {
  return { id: r.id, memberId: r.member_id, name: r.name ?? '', startDate: r.start_date ?? '', workouts: r.workouts ?? [], schedule: r.schedule ?? [] };
}

export function mapWorkoutLogRow(r) {
  return { id: r.id, memberId: r.member_id, workoutId: r.workout_id, date: r.date, readiness: r.readiness, exerciseNotes: r.exercise_notes ?? {}, sets: r.sets ?? [], programWeek: r.program_week, programDayNumber: r.program_day_number };
}
export function mapBodyCompRow(r) {
  return { id: r.id, memberId: r.member_id, date: r.date, weight: r.weight, bodyFat: r.body_fat, muscleMass: r.muscle_mass, notes: r.notes ?? '', photoUrl: r.photo_url };
}
export function mapRoleRow(r) {
  return { id: r.id, name: r.name, label: r.label ?? '', permissions: r.permissions ?? [], isSystem: r.is_system };
}
export function mapPaymentRow(r) {
  return { id: r.id, memberId: r.member_id, amount: Number(r.amount), date: r.date, method: r.method, type: r.type, note: r.note ?? '' };
}
export function mapExpenseRow(r) {
  return { id: r.id, date: r.date, amount: Number(r.amount), category: r.category ?? 'Other', note: r.note ?? '', paidFrom: r.paid_from ?? 'bank' };
}
export function mapCommunicationRow(r) {
  return { id: r.id, name: r.name, trigger: r.trigger ?? '', channel: r.channel ?? 'email', status: r.status ?? 'active', sent: r.sent ?? 0 };
}
export function mapMemberProgramRow(r) {
  return { id: r.id, memberId: r.member_id, programId: r.program_id, status: r.status, stripeSubscriptionId: r.stripe_subscription_id, startedAt: r.started_at, cyclesUsed: r.cycles_used ?? 0, pause: r.pause };
}
export function mapBalanceItemRow(r) {
  return { id: r.id, kind: r.kind, name: r.name, amount: Number(r.amount) };
}
export function mapCheckInRow(r) {
  return { id: r.id, memberId: r.member_id, weekStart: r.week_start, answers: r.answers ?? {}, submittedAt: r.submitted_at };
}
export function mapCategoryRow(r) {
  return { id: r.id, kind: r.kind, name: r.name };
}
export function mapTaxRow(r) {
  return { id: r.id, name: r.name, rate: Number(r.rate), appliesTo: r.applies_to ?? [], effectiveFrom: r.effective_from, enabled: r.enabled };
}
export function mapTaxRemittanceRow(r) {
  return { id: r.id, amount: Number(r.amount), date: r.date, note: r.note ?? '', paidFrom: r.paid_from ?? 'bank' };
}

export async function fetchAll() {
  const [members, plans, memberships, profiles, exercises, workouts, programs, personalPrograms, workoutLogs, bodyComp, roles, payments, expenses, communications, memberPrograms, balanceItems, categories, taxes, taxRemittances, checkIns] = await Promise.all([
    supabase.from('members').select('*').order('join_date', { ascending: false }),
    supabase.from('membership_plans').select('*').order('created_at', { ascending: true }),
    supabase.from('memberships').select('*'),
    // RLS: staff get all profiles; a client gets only their own.
    supabase.from('profiles').select('id, email, name, role, member_id'),
    supabase.from('exercises').select('*').order('name', { ascending: true }),
    supabase.from('workouts').select('*').order('created_at', { ascending: true }),
    supabase.from('programs').select('*').order('created_at', { ascending: true }),
    supabase.from('personal_programs').select('*'),
    supabase.from('workout_logs').select('*'),
    supabase.from('body_comp').select('*'),
    supabase.from('roles').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('communications').select('*').order('created_at', { ascending: true }),
    supabase.from('member_programs').select('*'),
    supabase.from('balance_items').select('*').order('created_at', { ascending: true }),
    supabase.from('categories').select('*').order('name', { ascending: true }),
    supabase.from('taxes').select('*').order('created_at', { ascending: true }),
    supabase.from('tax_remittances').select('*'),
    supabase.from('check_ins').select('*').order('week_start', { ascending: false }),
  ]);
  const firstError =
    members.error || plans.error || memberships.error || profiles.error || exercises.error || workouts.error || programs.error || personalPrograms.error || workoutLogs.error || bodyComp.error || roles.error || payments.error || expenses.error || communications.error || memberPrograms.error || balanceItems.error || categories.error || taxes.error || taxRemittances.error || checkIns.error;
  if (firstError) throw firstError;
  return {
    members: (members.data || []).map(mapMemberRow),
    membershipPlans: (plans.data || []).map(mapPlanRow),
    memberships: (memberships.data || []).map(mapMembershipRow),
    profiles: (profiles.data || []).map(mapProfileRow),
    exercises: (exercises.data || []).map(mapExerciseRow),
    workouts: (workouts.data || []).map(mapWorkoutRow),
    programs: (programs.data || []).map(mapProgramRow),
    personalPrograms: (personalPrograms.data || []).map(mapPersonalProgramRow),
    workoutLogs: (workoutLogs.data || []).map(mapWorkoutLogRow),
    bodyComp: (bodyComp.data || []).map(mapBodyCompRow),
    roles: (roles.data || []).map(mapRoleRow),
    payments: (payments.data || []).map(mapPaymentRow),
    expenses: (expenses.data || []).map(mapExpenseRow),
    communications: (communications.data || []).map(mapCommunicationRow),
    memberPrograms: (memberPrograms.data || []).map(mapMemberProgramRow),
    balanceItems: (balanceItems.data || []).map(mapBalanceItemRow),
    categories: (categories.data || []).map(mapCategoryRow),
    taxes: (taxes.data || []).map(mapTaxRow),
    taxRemittances: (taxRemittances.data || []).map(mapTaxRemittanceRow),
    checkIns: (checkIns.data || []).map(mapCheckInRow),
  };
}

export const DataContext = createContext(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
