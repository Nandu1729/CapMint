import { createPrivateKey, createPublicKey } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const renderStart = require('../../../scripts/render-start.js');

describe('Render practice deployment adapter', () => {
  it('derives a capmint_app URL without losing owner URL connection options', () => {
    const result = new URL(renderStart.buildAppDatabaseUrl(
      'postgresql://managed_owner:owner-password@db.internal:5432/capmint_practice?sslmode=require',
      'app+/password-with-32-characters'
    ));

    expect(result.username).toBe('capmint_app');
    expect(decodeURIComponent(result.password)).toBe('app+/password-with-32-characters');
    expect(result.hostname).toBe('db.internal');
    expect(result.pathname).toBe('/capmint_practice');
    expect(result.searchParams.get('sslmode')).toBe('require');
  });

  it('uses RENDER_EXTERNAL_URL for every public same-origin setting', () => {
    const environment: Record<string, string> = {
      RENDER_EXTERNAL_URL: 'https://capmint-practice.onrender.com/',
      BASE_URL: 'https://wrong.example',
      CORS_ORIGIN: 'https://wrong.example',
      VERIFY_FRONTEND_URL: 'https://wrong.example'
    };

    expect(renderStart.configureExternalUrls(environment)).toBe(
      'https://capmint-practice.onrender.com'
    );
    expect(environment.BASE_URL).toBe('https://capmint-practice.onrender.com');
    expect(environment.CORS_ORIGIN).toBe('https://capmint-practice.onrender.com');
    expect(environment.VERIFY_FRONTEND_URL).toBe('https://capmint-practice.onrender.com');
  });

  it('derives a stable matching Ed25519 keypair without writing key material', () => {
    const first: Record<string, string> = {
      CAPMINT_CERTIFIER_KEY_SEED: 'render-generated-seed-with-at-least-32-bytes'
    };
    const second = { ...first };

    expect(renderStart.configureCertifierKeys(first)).toBe('derived');
    expect(renderStart.configureCertifierKeys(second)).toBe('derived');
    expect(first.CERTIFIER_PRIVATE_KEY).toBe(second.CERTIFIER_PRIVATE_KEY);
    expect(first.CERTIFIER_PUBLIC_KEY).toBe(second.CERTIFIER_PUBLIC_KEY);
    expect(createPrivateKey(first.CERTIFIER_PRIVATE_KEY).asymmetricKeyType).toBe('ed25519');
    expect(createPublicKey(first.CERTIFIER_PUBLIC_KEY).asymmetricKeyType).toBe('ed25519');
  });

  it('removes provisioning credentials before npm start', () => {
    const child = renderStart.serviceEnvironment({
      ADMIN_DATABASE_URL: 'owner-url',
      CAPMINT_APP_PASSWORD: 'app-password',
      CAPMINT_CERTIFIER_KEY_SEED: 'key-seed',
      CAPMINT_BOOTSTRAP_ADMIN_PASSWORD: 'bootstrap-password',
      DATABASE_URL: 'app-url',
      CERTIFIER_PRIVATE_KEY: 'runtime-private-key',
      JWT_SECRET: 'runtime-jwt'
    });

    expect(child.ADMIN_DATABASE_URL).toBeUndefined();
    expect(child.CAPMINT_APP_PASSWORD).toBeUndefined();
    expect(child.CAPMINT_CERTIFIER_KEY_SEED).toBeUndefined();
    expect(child.CAPMINT_BOOTSTRAP_ADMIN_PASSWORD).toBeUndefined();
    expect(child.DATABASE_URL).toBe('app-url');
    expect(child.CERTIFIER_PRIVATE_KEY).toBe('runtime-private-key');
    expect(child.JWT_SECRET).toBe('runtime-jwt');
  });

  it('recognizes only the bootstrap tool JSON status', () => {
    expect(renderStart.parsedBootstrapResult(
      'noise\n{"success":false,"code":"ADMIN_ALREADY_EXISTS","message":"safe"}\n'
    )).toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' });
    expect(renderStart.parsedBootstrapResult('noise only')).toBeNull();
  });
});
