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
  const hintId = hint ? `${id || props.name || 'field'}-hint` : undefined
  const errorId = error ? `${id || props.name || 'field'}-error` : undefined
  return (
    <label className={`field ${className}`.trim()} htmlFor={id}>
      <span>{label}</span>
      {children || (
        <input
          id={id}
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
    <div className="filter-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          aria-label={item.ariaLabel}
          className={`filter-tab ${value === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}{item.count !== undefined && <span className="filter-count">{item.count}</span>}
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

export function EmptyState({ children, action, className = '' }) {
  return <div className={`empty-state ${className}`.trim()} role="status"><p>{children}</p>{action}</div>
}

export function PageToolbar({ title, live, action, className = '' }) {
  return (
    <div className={`page-toolbar ${className}`.trim()}>
      <h1 className="sr-only">{title}</h1>
      <span className={`live ${live === true ? 'on' : ''}`}>
        <span className="live-dot" aria-hidden="true" />
        <span className="sr-only">Connection: </span>{live === true ? 'Live' : live === false ? 'Reconnecting' : ''}
      </span>
      {action && <div className="page-toolbar-action">{action}</div>}
    </div>
  )
}
