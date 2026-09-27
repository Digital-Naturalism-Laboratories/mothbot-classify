import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppErrorScreen } from '../app-error-screen'

describe('AppErrorScreen', () => {
  it('explains size-limit crashes and offers a way out', () => {
    render(<AppErrorScreen error={new RangeError('Maximum call stack size exceeded')} reset={() => {}} />)
    expect(screen.getByText('Maximum call stack size exceeded')).toBeInTheDocument()
    expect(screen.getByText(/too large for the browser to handle at once/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to datasets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy error details' })).toBeInTheDocument()
  })

  it('shows a generic hint for other errors', () => {
    render(<AppErrorScreen error={new TypeError('x is undefined')} reset={() => {}} />)
    expect(screen.getByText('x is undefined')).toBeInTheDocument()
    expect(screen.queryByText(/too large for the browser/)).not.toBeInTheDocument()
    expect(screen.getByText(/Reloading usually gets you going again/)).toBeInTheDocument()
  })
})
