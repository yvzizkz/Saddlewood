import { beforeEach, describe, expect, it, vi } from 'vitest'

const { startRegistrationMock, startAuthenticationMock, supportsMock } = vi.hoisted(() => ({
  startRegistrationMock: vi.fn(),
  startAuthenticationMock: vi.fn(),
  supportsMock: vi.fn(() => true),
}))

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: supportsMock,
  startRegistration: startRegistrationMock,
  startAuthentication: startAuthenticationMock,
}))

import {
  enrollPasskey,
  forgetPasskeyOnThisDevice,
  PASSKEY_FLAG,
  passkeyOnThisDevice,
  rememberPasskeyOnThisDevice,
} from '@/lib/auth/passkeyClient'
import {
  hasCompletedOnboarding,
  markOnboardingComplete,
  onboardedStorageKey,
  resolveOnboardingRole,
  stepsForOnboarding,
  triggerOnboardingReplay,
} from '@/components/auth/OnboardingFlow'

function installMockLocalStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    value: {
      dispatchEvent: vi.fn(),
    },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
    writable: true,
  })
  return store
}

describe('resolveOnboardingRole', () => {
  it('distinguishes owner, pm, supervisor, and crew seats', () => {
    expect(resolveOnboardingRole({ kind: 'owner' })).toBe('owner')
    expect(
      resolveOnboardingRole({
        kind: 'crew',
        group: 'pm',
        perms: ['clock', 'crew.view', 'projects.view', 'projects.mine', 'money.view'],
      }),
    ).toBe('pm')
    expect(
      resolveOnboardingRole({
        kind: 'crew',
        group: 'custom-lead',
        perms: ['clock', 'projects.view', 'money.view'],
      }),
    ).toBe('pm')
    expect(
      resolveOnboardingRole({
        kind: 'crew',
        group: 'supervisor',
        perms: ['clock', 'crew.view', 'tasks.verify'],
      }),
    ).toBe('supervisor')
    expect(
      resolveOnboardingRole({
        kind: 'crew',
        group: 'crew',
        perms: ['clock', 'receipts'],
      }),
    ).toBe('crew')
  })
})

describe('stepsForOnboarding', () => {
  it('orders Add to Home Screen -> Face ID -> Role when in browser and Face ID is offered', () => {
    expect(stepsForOnboarding({ standalone: false, offerFaceId: true })).toEqual(['install', 'faceid', 'role'])
  })

  it('skips Add to Home Screen when already running from the Home Screen icon', () => {
    expect(stepsForOnboarding({ standalone: true, offerFaceId: true })).toEqual(['faceid', 'role'])
  })

  it('shows only the 1-screen role tour when installed and Face ID is already enrolled', () => {
    expect(stepsForOnboarding({ standalone: true, offerFaceId: false })).toEqual(['role'])
  })
})

describe('onboarding completion persistence', () => {
  beforeEach(() => {
    installMockLocalStorage()
  })

  it('stores and resets completion per email address', () => {
    const email = 'Marco@SaddlewoodContracting.com'
    expect(hasCompletedOnboarding(email)).toBe(false)
    markOnboardingComplete(email)
    expect(localStorage.getItem(onboardedStorageKey(email))).toBe('1')
    expect(hasCompletedOnboarding('marco@saddlewoodcontracting.com')).toBe(true)
    expect(hasCompletedOnboarding('info@saddlewoodcontracting.com')).toBe(false)

    triggerOnboardingReplay(email)
    expect(hasCompletedOnboarding(email)).toBe(false)
  })
})

describe('enrollPasskey Safari / Home Screen split recovery', () => {
  beforeEach(() => {
    installMockLocalStorage()
    startRegistrationMock.mockReset()
  })

  it('marks the device as enrolled when iOS reports the excluded credential is already on this phone', async () => {
    forgetPasskeyOnThisDevice()
    expect(passkeyOnThisDevice()).toBe(false)

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          options: {
            challenge: 'abc',
            excludeCredentials: [{ id: 'cred-123', type: 'public-key' }],
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const dupErr = Object.assign(new Error('The authenticator was previously registered'), {
      name: 'InvalidStateError',
      code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
    })
    startRegistrationMock.mockRejectedValueOnce(dupErr)

    const res = await enrollPasskey('iPhone')
    expect(res).toEqual({ id: 'cred-123' })
    expect(passkeyOnThisDevice()).toBe(true)
    expect(localStorage.getItem(PASSKEY_FLAG)).toBe('1')
    // Did not need a PUT round-trip because the credential is already registered.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('remembers passkey on this device via rememberPasskeyOnThisDevice()', () => {
    forgetPasskeyOnThisDevice()
    expect(passkeyOnThisDevice()).toBe(false)
    rememberPasskeyOnThisDevice()
    expect(passkeyOnThisDevice()).toBe(true)
  })
})
