'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COUNTRY_DIAL_CODES, type OtpRequestResult } from '@kodecupid/shared';
import { apiFetch, ApiError, errorMessage } from '@/lib/api';
import { savePendingOtp } from '@/lib/otp';
import { Button } from '@/components/ui/button';
import { TextInput, SelectField } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';

/**
 * Shared phone-entry step for both register and login. The only difference is
 * the copy, because the API treats "new number" and "returning number"
 * identically until verification succeeds.
 */
export function PhoneAuthForm({ flow }: { flow: 'register' | 'login' }) {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState('US');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const countryOptions = useMemo(
    () =>
      COUNTRY_DIAL_CODES.map((country) => ({
        value: country.iso2,
        label: `${country.name} (${country.dialCode})`,
      })),
    [],
  );

  const dialCode = COUNTRY_DIAL_CODES.find((country) => country.iso2 === countryCode)?.dialCode ?? '';

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setPhoneError(null);

    if (phone.replace(/\D/g, '').length < 6) {
      setPhoneError('Enter your phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<OtpRequestResult>('/auth/request-otp', {
        method: 'POST',
        body: { phone, countryCode },
      });

      savePendingOtp({
        challengeId: result.challengeId,
        phone: result.phone,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
        ...(result.debugCode ? { debugCode: result.debugCode } : {}),
        flow,
      });

      if (result.debugCode) {
        window.sessionStorage.setItem('kc_debug_code', result.debugCode);
      }

      router.push('/verify');
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors.phone) {
        setPhoneError(caught.fieldErrors.phone);
      } else {
        setError(errorMessage(caught, 'We could not send a code. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <SelectField
        label="Country"
        required
        value={countryCode}
        onChange={(event) => setCountryCode(event.target.value)}
        options={countryOptions}
        autoComplete="country"
      />

      <TextInput
        label="Phone number"
        required
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="555 123 4567"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        prefix={dialCode}
        error={phoneError ?? undefined}
        hint="We send a 6-digit code. Standard SMS rates may apply."
      />

      <Button type="submit" size="lg" fullWidth loading={loading}>
        {flow === 'register' ? 'Send my code' : 'Send sign-in code'}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted">
        {flow === 'register'
          ? 'KodeCupid is for adults 18 and over. Next, you will confirm your date of birth and review our Terms of Service, Community Guidelines and Safety Tips.'
          : 'KodeCupid is for adults 18 and over. By signing in you continue to agree to our Terms of Service, Community Guidelines and Safety Tips.'}
      </p>
    </form>
  );
}
