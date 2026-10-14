import { useEffect } from 'react'

/** Bootstrap-styled modal. Omit `onClose` for a modal the user can't dismiss. */
export default function Modal({ title, onClose, footer, children }) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content text-dark">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              {onClose && <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />}
            </div>
            {children && <div className="modal-body">{children}</div>}
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  )
}
