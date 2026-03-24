import { useState } from 'react';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';

export default function PasswordChange() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Inline field-level errors (shown as user types after first interaction)
  const [touched, setTouched] = useState({ current: false, new: false, confirm: false });
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Derived inline errors
  const newPasswordError =
    touched.new && newPassword.length > 0 && newPassword.length < 8
      ? 'Must be at least 8 characters'
      : '';
  const confirmPasswordError =
    touched.confirm && confirmPassword.length > 0 && confirmPassword !== newPassword
      ? 'Passwords do not match'
      : '';
  const isValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword === newPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setSuccess(false);
    setTouched({ current: true, new: true, confirm: true });

    if (!currentPassword || !newPassword || !confirmPassword) {
      setServerError('All fields are required');
      return;
    }
    if (newPassword.length < 8) {
      setServerError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setServerError('New passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTouched({ current: false, new: false, confirm: false });
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Change Password
        </CardTitle>
        <CardDescription>
          Update your admin password for enhanced security
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>Password changed successfully!</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, current: true }))}
              placeholder="Enter current password"
              required
              data-testid="input-current-password"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, new: true }))}
              placeholder="Enter new password (min 8 characters)"
              required
              aria-describedby={newPasswordError ? "new-password-error" : undefined}
              data-testid="input-new-password"
              autoComplete="new-password"
            />
            {newPasswordError && (
              <p id="new-password-error" role="alert" className="text-xs text-destructive">
                {newPasswordError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              placeholder="Confirm new password"
              required
              aria-describedby={confirmPasswordError ? "confirm-password-error" : undefined}
              data-testid="input-confirm-password"
              autoComplete="new-password"
            />
            {confirmPasswordError && (
              <p id="confirm-password-error" role="alert" className="text-xs text-destructive">
                {confirmPasswordError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading || !isValid}
            className="w-full"
            data-testid="button-change-password"
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
