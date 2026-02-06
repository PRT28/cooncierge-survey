import React, { useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const STEPS = [
  { id: 'profiling', title: 'Profiling' },
  { id: 'pain', title: 'Pain Points' },
  { id: 'photo', title: 'Photo' },
  { id: 'review', title: 'Review & Submit' }
]

const initialForm = {
  profiling: {
    products: ['Tours & Experiences'],
    productsOther: '',
    audience: ['Direct Consumers'],
    audienceOther: '',
    teamSize: 12
  },
  painPoints: {
    customerEnd: {
      lms: false,
      conversionTimeQuote: false,
      rightCustomers: false,
      other: ''
    },
    internalOps: {
      finance: false,
      reports: false,
      dk: false,
      dayToDayBookings: false,
      onTripOps: false,
      trainingNewJoinee: false,
      other: ''
    },
    supplierEnd: {
      marketplace: false,
      prices: false,
      landPartPrices: false,
      other: ''
    }
  },
  photo: {
    file: null,
    previewUrl: ''
  }
}

function validateStep(stepId, form) {
  if (stepId === 'profiling') {
    const { products, audience, productsOther, audienceOther } = form.profiling
    const productsOk = products.length > 0 && (!products.includes('Other') || productsOther.trim())
    const audienceOk = audience.length > 0 && (!audience.includes('Other') || audienceOther.trim())
    return productsOk && audienceOk
  }
  if (stepId === 'pain') {
    return true
  }
  if (stepId === 'photo') {
    return true
  }
  return true
}

function buildPayload(form) {
  return {
    profiling: form.profiling,
    pain_points: {
      customer_end: form.painPoints.customerEnd,
      internal_ops: form.painPoints.internalOps,
      supplier_end: form.painPoints.supplierEnd
    }
  }
}

export default function App() {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState({ state: 'idle', message: '' })
  const [consent, setConsent] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)
  const fileInputRef = useRef(null)

  const step = STEPS[stepIndex]
  const canProceed = useMemo(() => validateStep(step.id, form), [step.id, form])

  function updateProfiling(field, value) {
    setForm(prev => ({
      ...prev,
      profiling: {
        ...prev.profiling,
        [field]: value
      }
    }))
  }

  function updatePainPoints(group, field, value) {
    setForm(prev => ({
      ...prev,
      painPoints: {
        ...prev.painPoints,
        [group]: {
          ...prev.painPoints[group],
          [field]: value
        }
      }
    }))
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setStatus({ state: 'error', message: 'Please select an image file.' })
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setForm(prev => ({
      ...prev,
      photo: { file, previewUrl }
    }))
  }

  function handleRetake() {
    if (form.photo.previewUrl) {
      URL.revokeObjectURL(form.photo.previewUrl)
    }
    setForm(prev => ({
      ...prev,
      photo: { file: null, previewUrl: '' }
    }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function nextStep() {
    if (!canProceed) {
      setStatus({ state: 'error', message: 'Please complete this step to continue.' })
      return
    }
    setStatus({ state: 'idle', message: '' })
    setStepIndex(prev => Math.min(prev + 1, STEPS.length - 1))
  }

  function prevStep() {
    setStatus({ state: 'idle', message: '' })
    setStepIndex(prev => Math.max(prev - 1, 0))
  }

  async function handleSubmit() {
    if (!consent) {
      setStatus({ state: 'error', message: 'Please confirm consent to submit.' })
      return
    }

    setStatus({ state: 'loading', message: 'Submitting...' })

    try {
      const payload = buildPayload(form)
      const { data: surveyRow, error: insertError } = await supabase
        .from('surveys')
        .insert([
          {
            data: payload,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single()

      if (insertError) {
        throw insertError
      }

      const surveyId = surveyRow.id
      if (form.photo.file) {
        const fileExt = form.photo.file.name.split('.').pop()
        const fileName = `survey-${surveyId}-${Date.now()}.${fileExt}`
        const filePath = `survey-photos/${fileName}`

        const { error: uploadError } = await supabase
          .storage
          .from('survey-uploads')
          .upload(filePath, form.photo.file, {
            contentType: form.photo.file.type,
            upsert: false
          })

        if (uploadError) {
          throw uploadError
        }

        const { data: publicData } = supabase
          .storage
          .from('survey-uploads')
          .getPublicUrl(filePath)

        const { error: updateError } = await supabase
          .from('surveys')
          .update({
            photo_path: filePath,
            photo_url: publicData?.publicUrl ?? null
          })
          .eq('id', surveyId)

        if (updateError) {
          throw updateError
        }
      }

      setStatus({ state: 'success', message: 'Survey submitted successfully.' })
      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        setStatus({ state: 'idle', message: '' })
        setForm(initialForm)
        setConsent(true)
        setStepIndex(0)
        if (form.photo.previewUrl) {
          URL.revokeObjectURL(form.photo.previewUrl)
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }, 1800)
    } catch (error) {
      setStatus({ state: 'error', message: error.message || 'Submission failed.' })
    }
  }

  function renderProfiling() {
    const teamLabel = form.profiling.teamSize >= 100 ? '100+' : String(form.profiling.teamSize)

    return (
      <div className="card">
        <h2>Profiling</h2>
        <p className="hint">Tell us about your business setup.</p>
        <div className="field">
          <span>Products (multi-select)</span>
          <div className="checkbox-grid">
            {[
              'Tours & Experiences',
              'Corporate Travel',
              'Inbound Travel (DMC)',
              'SaaS / Travel Tech',
              'Other'
            ].map(option => (
              <label className="checkbox" key={option}>
                <input
                  type="checkbox"
                  checked={form.profiling.products.includes(option)}
                  onChange={event => {
                    const next = event.target.checked
                      ? [...form.profiling.products, option]
                      : form.profiling.products.filter(item => item !== option)
                    updateProfiling('products', next)
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
        {form.profiling.products.includes('Other') && (
          <label className="field">
            <span>Other Product</span>
            <input
              type="text"
              value={form.profiling.productsOther}
              onChange={event => updateProfiling('productsOther', event.target.value)}
              placeholder="Describe your product"
              required
            />
          </label>
        )}

        <div className="field">
          <span>Audience (multi-select)</span>
          <div className="checkbox-grid">
            {[
              'Direct Consumers',
              'B2B Travel Agents',
              'Corporate Clients',
              'Schools / Groups',
              'Other'
            ].map(option => (
              <label className="checkbox" key={option}>
                <input
                  type="checkbox"
                  checked={form.profiling.audience.includes(option)}
                  onChange={event => {
                    const next = event.target.checked
                      ? [...form.profiling.audience, option]
                      : form.profiling.audience.filter(item => item !== option)
                    updateProfiling('audience', next)
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
        {form.profiling.audience.includes('Other') && (
          <label className="field">
            <span>Other Audience</span>
            <input
              type="text"
              value={form.profiling.audienceOther}
              onChange={event => updateProfiling('audienceOther', event.target.value)}
              placeholder="Describe your audience"
              required
            />
          </label>
        )}

        <div className="field">
          <span>Team Size</span>
          <div className="slider-row">
            <input
              className="slider"
              type="range"
              min="1"
              max="100"
              step="1"
              value={form.profiling.teamSize}
              onChange={event => updateProfiling('teamSize', Number(event.target.value))}
            />
            <span className="slider-value">{teamLabel}</span>
          </div>
          <p className="hint">Slide to 100 if you have 100+ team members.</p>
        </div>
      </div>
    )
  }

  function renderPainPoints() {
    const { customerEnd, internalOps, supplierEnd } = form.painPoints

    return (
      <div className="card">
        <h2>Pain Points</h2>
        <p className="hint">Select all that apply and add notes if needed.</p>

        <div className="section">
          <h3>Customer End</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={customerEnd.lms}
              onChange={event => updatePainPoints('customerEnd', 'lms', event.target.checked)}
            />
            LMS
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={customerEnd.conversionTimeQuote}
              onChange={event => updatePainPoints('customerEnd', 'conversionTimeQuote', event.target.checked)}
            />
            Conversion time (quote)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={customerEnd.rightCustomers}
              onChange={event => updatePainPoints('customerEnd', 'rightCustomers', event.target.checked)}
            />
            Right customers
          </label>
          <label className="field">
            <span>Other</span>
            <input
              type="text"
              value={customerEnd.other}
              onChange={event => updatePainPoints('customerEnd', 'other', event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="section">
          <h3>Internal Ops - Team</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={internalOps.finance}
              onChange={event => updatePainPoints('internalOps', 'finance', event.target.checked)}
            />
            Finance
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={internalOps.reports}
              onChange={event => updatePainPoints('internalOps', 'reports', event.target.checked)}
            />
            Reports
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={internalOps.dk}
              onChange={event => updatePainPoints('internalOps', 'dk', event.target.checked)}
            />
            DK
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={internalOps.dayToDayBookings}
              onChange={event => updatePainPoints('internalOps', 'dayToDayBookings', event.target.checked)}
            />
            Day-to-day bookings
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={internalOps.onTripOps}
              onChange={event => updatePainPoints('internalOps', 'onTripOps', event.target.checked)}
            />
            On-trip ops management
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={internalOps.trainingNewJoinee}
              onChange={event => updatePainPoints('internalOps', 'trainingNewJoinee', event.target.checked)}
            />
            Training new joinee
          </label>
          <label className="field">
            <span>Other</span>
            <input
              type="text"
              value={internalOps.other}
              onChange={event => updatePainPoints('internalOps', 'other', event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="section">
          <h3>Supplier End</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={supplierEnd.marketplace}
              onChange={event => updatePainPoints('supplierEnd', 'marketplace', event.target.checked)}
            />
            Marketplace
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={supplierEnd.prices}
              onChange={event => updatePainPoints('supplierEnd', 'prices', event.target.checked)}
            />
            Prices
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={supplierEnd.landPartPrices}
              onChange={event => updatePainPoints('supplierEnd', 'landPartPrices', event.target.checked)}
            />
            Land part prices
          </label>
          <label className="field">
            <span>Other</span>
            <input
              type="text"
              value={supplierEnd.other}
              onChange={event => updatePainPoints('supplierEnd', 'other', event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
      </div>
    )
  }

  function renderPhoto() {
    return (
      <div className="card">
        <h2>Capture Photo</h2>
        <p className="hint">Optional. Use your phone camera to take a quick photo.</p>

        <div className="photo-area">
          {form.photo.previewUrl ? (
            <img src={form.photo.previewUrl} alt="Preview" />
          ) : (
            <div className="photo-placeholder">No photo yet</div>
          )}
        </div>

        <div className="photo-actions">
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />
          {form.photo.previewUrl && (
            <button type="button" className="button ghost" onClick={handleRetake}>
              Retake
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderReview() {
    return (
      <div className="card">
        <h2>Review & Submit</h2>
        <p className="hint">Check the details before submitting.</p>

        <div className="summary">
          <div>
            <h4>Profiling</h4>
            <p>
              <strong>Products:</strong>{' '}
              {form.profiling.products.length
                ? form.profiling.products
                    .map(item => (item === 'Other' ? form.profiling.productsOther || 'Other' : item))
                    .join(', ')
                : '-'}
            </p>
            <p>
              <strong>Audience:</strong>{' '}
              {form.profiling.audience.length
                ? form.profiling.audience
                    .map(item => (item === 'Other' ? form.profiling.audienceOther || 'Other' : item))
                    .join(', ')
                : '-'}
            </p>
            <p><strong>Team size:</strong> {form.profiling.teamSize >= 100 ? '100+' : form.profiling.teamSize}</p>
          </div>
          <div>
            <h4>Photo</h4>
            {form.photo.previewUrl ? (
              <img src={form.photo.previewUrl} alt="Preview" />
            ) : (
              <p>No photo selected.</p>
            )}
          </div>
        </div>

        <label className="checkbox consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={event => setConsent(event.target.checked)}
          />
          I confirm the details provided are accurate.
        </label>

        <button
          type="button"
          className="button primary"
          onClick={handleSubmit}
          disabled={status.state === 'loading'}
        >
          {status.state === 'loading' ? 'Submitting...' : 'Submit Survey'}
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Mobile Survey</p>
          <h1>Cooncierge Field Feedback</h1>
        </div>
        <div className="progress">
          <div className="progress-bar">
            <span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p>{stepIndex + 1} of {STEPS.length} · {step.title}</p>
        </div>
      </header>

      <main>
        {step.id === 'profiling' && renderProfiling()}
        {step.id === 'pain' && renderPainPoints()}
        {step.id === 'photo' && renderPhoto()}
        {step.id === 'review' && renderReview()}
      </main>

      {status.message && (
        <div className={`status ${status.state}`}>{status.message}</div>
      )}

      <footer className="footer">
        <button
          type="button"
          className="button ghost"
          onClick={prevStep}
          disabled={stepIndex === 0}
        >
          Back
        </button>
        {step.id !== 'review' ? (
          <button
            type="button"
            className="button primary"
            onClick={nextStep}
          >
            Continue
          </button>
        ) : null}
      </footer>

      {showSuccess && (
        <div className="success-overlay" role="status" aria-live="polite">
          <div className="success-card">
            <div className="checkmark">
              <svg viewBox="0 0 52 52" aria-hidden="true">
                <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                <path className="checkmark-check" fill="none" d="M14 27l7 7 17-17" />
              </svg>
            </div>
            <p>Submitted!</p>
          </div>
        </div>
      )}
    </div>
  )
}
