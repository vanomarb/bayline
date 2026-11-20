/** [data-concept] controls are plain links without scripts; with them, each opens this one dialog. */
export function initConceptDialog(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#concept-dialog')
  if (!dialog) return
  let opener: HTMLElement | null = null

  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-concept]')
    if (!trigger) return
    event.preventDefault()
    opener = trigger
    dialog.showModal()
  })

  dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => {
    opener?.focus()
    opener = null
  })
}
