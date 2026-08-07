import { useState, useCallback } from 'react'

/**
 * Custom validation hook for form fields.
 * Provides real-time validation, error messages, and form state management.
 */
export function useFormValidation(initialValues, validationRules) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  const validateField = useCallback((name, value) => {
    const rules = validationRules[name]
    if (!rules) return ''

    if (rules.required && (!value || !value.toString().trim())) {
      return rules.requiredMsg || `${name} is required`
    }
    if (rules.minLength && value.length < rules.minLength) {
      return rules.minLengthMsg || `Must be at least ${rules.minLength} characters`
    }
    if (rules.maxLength && value.length > rules.maxLength) {
      return rules.maxLengthMsg || `Must be at most ${rules.maxLength} characters`
    }
    if (rules.pattern && !rules.pattern.test(value)) {
      return rules.patternMsg || `Invalid format`
    }
    if (rules.custom) {
      return rules.custom(value, values) || ''
    }
    return ''
  }, [validationRules, values])

  const handleChange = useCallback((e) => {
    const { name, value } = e.target
    setValues(prev => ({ ...prev, [name]: value }))
    if (touched[name]) {
      setErrors(prev => ({ ...prev, [name]: validateField(name, value) }))
    }
  }, [touched, validateField])

  const handleBlur = useCallback((e) => {
    const { name, value } = e.target
    setTouched(prev => ({ ...prev, [name]: true }))
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }))
  }, [validateField])

  const validateAll = useCallback(() => {
    const newErrors = {}
    let valid = true
    for (const name of Object.keys(validationRules)) {
      const error = validateField(name, values[name] || '')
      if (error) {
        newErrors[name] = error
        valid = false
      }
    }
    setErrors(newErrors)
    setTouched(Object.keys(validationRules).reduce((a, k) => ({ ...a, [k]: true }), {}))
    return valid
  }, [validationRules, values, validateField])

  const resetForm = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  return { values, errors, touched, handleChange, handleBlur, validateAll, resetForm, setValues }
}

// Email regex — @gmail.com only
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/

// Password strength helper
export function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 6) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  const levels = [
    { label: 'Very Weak', color: '#EF4444' },
    { label: 'Weak', color: '#F97316' },
    { label: 'Fair', color: '#F59E0B' },
    { label: 'Strong', color: '#22C55E' },
    { label: 'Very Strong', color: '#10B981' },
  ]
  const idx = Math.min(score, levels.length) - 1
  return { score, ...levels[Math.max(idx, 0)] }
}

// Password criteria checklist helper
export function getPasswordCriteria(pw = '') {
  return [
    { id: 'length',    label: '6 to 8 characters',               met: pw.length >= 6 && pw.length <= 8 },
    { id: 'uppercase', label: 'One capital letter (A-Z)',          met: /[A-Z]/.test(pw) },
    { id: 'lowercase', label: 'One lowercase letter (a-z)',        met: /[a-z]/.test(pw) },
    { id: 'number',    label: 'One number (0-9)',                  met: /[0-9]/.test(pw) },
    { id: 'special',   label: 'One special character (!@#$%...)', met: /[^A-Za-z0-9]/.test(pw) },
  ]
}
