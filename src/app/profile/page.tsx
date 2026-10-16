import { COUNTRIES } from '@/lib/countries';
import { PROFILE_FIELDS } from '@/lib/users';
import { requireUser } from '@/lib/session';
import { PasswordForm, ProfileForm } from './ProfileForms';

export const metadata = { title: 'Your speaker profile' };

export default async function ProfilePage() {
  const user = await requireUser('/profile');
  const profile = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, user[f] ?? '']));
  return (
    <>
      <h1>Your speaker profile</h1>
      <p className="muted">This information is shared with the program committee and, if your talk is accepted, used on the conference website and in speaker communications.</p>
      <div className="two-col">
        <section className="card"><ProfileForm profile={profile} countries={COUNTRIES} /></section>
        <section className="card">
          <h2>Account</h2>
          <p><strong>Email:</strong> {user.email}<br /><strong>Role:</strong> {user.role}</p>
          <h3>Change password</h3>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
