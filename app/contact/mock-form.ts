import { readContact } from '../lib/account.ts'
import { fill } from '../lib/format.ts'
import { say } from '../shared/ui.ts'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/**
 * Copy: data-msg-empty, data-msg-invalid (type="email", or data-check="contact" for email or mobile) on each field or the
 * form, and data-msg-done ({name}, {email}) on the form. Errors go in #<field id>-error. Nothing is sent or stored.
 */
export function initMockForm(form: HTMLFormElement): void {
  const done = form.querySelector<HTMLElement>('[data-form-done]')
  const fields = [...form.querySelectorAll<Field>('input, select, textarea')]
  if (!done) return

  const message = (field: Field, key: 'msgEmpty' | 'msgInvalid') => field.dataset[key] ?? form.dataset[key] ?? ''

  function setError(field: Field, text: string): void {
    const box = document.getElementById(`${field.id}-error`)
    if (box) say(box, text)
    if (text === '') field.removeAttribute('aria-invalid')
    else field.setAttribute('aria-invalid', 'true')
  }

  function problem(field: Field): string {
    const value = field.value.trim()
    if (value === '') return field.required ? message(field, 'msgEmpty') : ''
    const contact = readContact(value)
    if (field.type === 'email' && !(contact.ok && contact.kind === 'email')) return message(field, 'msgInvalid')
    if (field.dataset.check === 'contact' && !contact.ok) return message(field, 'msgInvalid')
    return ''
  }

  for (const field of fields) {
    field.addEventListener('input', () => setError(field, ''))
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    done.hidden = true
    let first: Field | null = null
    for (const field of fields) {
      const text = problem(field)
      setError(field, text)
      if (text && !first) first = field
    }
    if (first) {
      first.focus()
      return
    }
    const value = (name: string) => form.querySelector<Field>(`[name="${name}"]`)?.value.trim() ?? ''
    const text = fill(form.dataset.msgDone ?? '', { name: value('name'), email: value('email') })
    ;(done.querySelector<HTMLElement>('[data-done-text]') ?? done).textContent = text
    form.reset()
    done.hidden = false
    done.focus()
  })
}
