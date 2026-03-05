'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath }    from 'next/cache'
import type { TaskStatus }   from '@/types/database.types'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return user
}

// ─── Create ───────────────────────────────────────────────────

export async function createTask(title: string, dueDate?: string) {
  const user  = await getAuthenticatedUser()
  const admin = createAdminClient()

  const { error } = await admin.from('tasks').insert({
    title:       title.trim(),
    due_date:    dueDate || null,
    status:      'pending',
    source_type: 'manual',
    assigned_to: user.id,
    created_by:  user.id,
  })

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'task.created',
    entity_type: 'task',
    payload:     { title },
  })

  revalidatePath('/tareas')
}

// ─── Update status ────────────────────────────────────────────

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const user  = await getAuthenticatedUser()
  const admin = createAdminClient()

  const { error } = await admin
    .from('tasks')
    .update({ status })
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'task.status_changed',
    entity_type: 'task',
    entity_id:   taskId,
    payload:     { status },
  })

  revalidatePath('/tareas')
}

// ─── Delete ───────────────────────────────────────────────────

export async function deleteTask(taskId: string) {
  const user  = await getAuthenticatedUser()
  const admin = createAdminClient()

  const { error } = await admin
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'task.deleted',
    entity_type: 'task',
    entity_id:   taskId,
  })

  revalidatePath('/tareas')
}
