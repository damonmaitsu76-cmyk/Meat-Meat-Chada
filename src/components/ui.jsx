import { useId, useRef, useState } from 'react'
import { useReportLive } from './liveStatus.js'

const STATUS = {
  sent: ['neutral', 'New'],
  accepted: ['neutral', 'Accepted'],
  ready: ['ink', 'Ready'],
  served: ['ok', 'Served'],
  pending: ['warn', 'Pending'],
  approved: ['neutral', 'Approved'],
  arrived: ['ok', 'Arrived'],
  declined: ['muted', 'Declined'],
  cancelled: ['muted', 'Cancelled'],
  auto_cancelled: ['muted', 'Released'],
  reserved: ['warn', 'Reserved'],
  dining: ['ink', 'Dining'],
}

export function Button({ variant = 'primary', size, className = '', ...props }) {
  const classes = ['btn', variant === 'primary' ? '' : variant, size === 'small' ? 'small' : '', className]
    .filter(Boolean)
    .join(' ')
  return <button className={classes} {...props} />
}

export function Field({ label, hint, error, id, className = '', children, ...props }) {
  const generatedId = useId().replace(/:/g, '')
  const controlId = id || props.name || `field-${generatedId}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  return (
    <label className={`field ${className}`.trim()} htmlFor={controlId}>
      <span>{label}</span>
      {children || (
        <input
          id={controlId}
          {...props}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        />
      )}
      {hint && <small className="field-hint" id={hintId}>{hint}</small>}
      {error && <small className="field-error" id={errorId}>{error}</small>}
    </label>
  )
}

export function StatusChip({ status, children, className = '' }) {
  const [tone, label] = STATUS[status] || ['muted', status || 'Unknown']
  return <span className={`status-chip ${tone} ${className}`.trim()}>{children || label}</span>
}

export function Notice({ tone = 'info', action, children, className = '' }) {
  return (
    <div className={`notice notice-${tone} ${className}`.trim()} role="status">
      <div>{children}</div>
      {action}
    </div>
  )
}

export function RecordCard({ title, subtitle, meta, status, children, actions, className = '' }) {
  return (
    <article className={`record-card ${className}`.trim()}>
      <div className="record-head">
        <div className="record-title-wrap">
          {title && <h2 className="record-title">{title}</h2>}
          {subtitle && <p className="record-subtitle">{subtitle}</p>}
        </div>
        {status}
      </div>
      {meta && <div className="record-meta">{meta}</div>}
      {children && <div className="record-body">{children}</div>}
      {actions && <div className="record-actions">{actions}</div>}
    </article>
  )
}

export function ResponsiveRecords({ headers, records, className = '' }) {
  return (
    <div className={`responsive-records ${className}`.trim()}>
      <div className="record-cards">
        {records.map((record) => <div key={record.key}>{record.card}</div>)}
      </div>
      <div className="records-table-wrap">
        <table className="q-table">
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.key}>
                {record.cells.map((cell, index) => <td key={`${record.key}-${index}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FilterTabs({ items, value, onChange, label = 'Filters' }) {
  return (
    <div
      className="filter-tabs"
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const buttons = Array.from(event.currentTarget.querySelectorAll('[data-filter-tab]'))
        const current = buttons.indexOf(event.target)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
        if (items[next]) onChange(items[next].key)
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-filter-tab
          aria-pressed={value === item.key}
          aria-label={item.ariaLabel}
          className={`filter-tab ${value === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
      {item.label}{item.count > 0 && <span className="filter-count">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Segmented({ items, value, onChange, label, disabled = false }) {
  function move(event) {
    if (disabled) return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = Array.from(event.currentTarget.querySelectorAll('[data-segmented-radio]'))
    const current = buttons.indexOf(event.target)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    if (items[next]) onChange(items[next].key)
    buttons[next]?.focus()
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={move}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="radio"
          data-segmented-radio
          aria-checked={value === item.key}
          tabIndex={value === item.key ? 0 : -1}
          disabled={disabled}
          className="segmented-option"
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function Disclosure({ label, children, className = '', open = false }) {
  return (
    <details className={`disclosure ${className}`.trim()} open={open || undefined}>
      <summary>{label}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}

export function Stepper({ value, onChange, label, max = Infinity, min = 0 }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(-1)}>−</button>
      <span aria-label={`${value} ${label}`} className="stepper-value">{value}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(1)}>+</button>
    </div>
  )
}

export function Switch({ checked, label, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={onChange}
    />
  )
}

export function FileDrop({ file, onFile, onError, inputKey }) {
  const inputId = `file-drop-${useId().replace(/:/g, '')}`
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function accept(candidate) {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      onFile(null)
      onError('Choose a .csv file.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    onError('')
    onFile(candidate)
  }

  return (
    <div
      className={`file-drop ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); accept(event.dataTransfer.files?.[0]) }}
    >
      <input
        key={inputKey}
        ref={inputRef}
        id={inputId}
        className="sr-only"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => accept(event.target.files?.[0])}
      />
      <label className="sr-only" htmlFor={inputId}>CSV file</label>
      {file ? (
        <div className="file-drop-selected">
          <span className="file-drop-meta"><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB</small></span>
          <Button variant="ghost" size="small" type="button" onClick={() => { onFile(null); onError(''); if (inputRef.current) inputRef.current.value = '' }}>Remove</Button>
        </div>
      ) : (
        <div className="file-drop-idle">
          <span className="file-drop-hint">Drop a CSV file here</span>
          <Button variant="secondary" type="button" onClick={() => inputRef.current?.click()}>Choose file</Button>
        </div>
      )}
    </div>
  )
}

export function EmptyState({ children, action, className = '' }) {
  return <div className={`empty-state ${className}`.trim()} role="status"><p>{children}</p>{action}</div>
}

export function PageToolbar({ title, live, action, className = '' }) {
  useReportLive(live)
  if (!action) return <h1 className="sr-only">{title}</h1>

  return (
    <div className={`page-toolbar ${className}`.trim()}>
      <h1 className="sr-only">{title}</h1>
      <div className="page-toolbar-action">{action}</div>
    </div>
  )
}

export function LiveIndicator({ live }) {
  return (
    <span className={`staff-live ${live ? 'on' : 'off'}`} aria-live="polite">
      <span className="live-dot" aria-hidden="true" />
      {live ? <span className="sr-only">Live</span> : <span>Reconnecting</span>}
    </span>
  )
}

