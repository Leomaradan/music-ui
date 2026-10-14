import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, waitFor } from 'storybook/test';
import LoginForm from './LoginForm';

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Answers POST /api/auth/login like the server: one valid account, alice / correct-horse. */
function installLoginApi(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (urlOf(input) !== '/api/auth/login') return original(input, init);
    const body = typeof init?.body === 'string' ? init.body : '{}';
    const { username, password } = JSON.parse(body) as Record<string, string>;
    if (username === 'alice' && password === 'correct-horse') {
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: 'Wrong username or password' }, { status: 401 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const meta = {
  title: 'Layout/LoginForm',
  component: LoginForm,
  args: { next: '/', noUsers: false, onSignedIn: fn() },
  parameters: { layout: 'fullscreen' },
  beforeEach: installLoginApi,
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Valid credentials sign in and go to the page asked for. */
export const SignIn: Story = {
  args: { next: '/?from=login' },
  play: async ({ args, userEvent }) => {
    await userEvent.type(screen.getByLabelText(/Username/), 'alice');
    await userEvent.type(screen.getByLabelText(/Password/), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(args.onSignedIn).toHaveBeenCalledWith('/?from=login'));
  },
};

/** A wrong password shows the error and clears the password field. */
export const WrongPassword: Story = {
  play: async ({ args, userEvent }) => {
    await userEvent.type(screen.getByLabelText(/Username/), 'alice');
    await userEvent.type(screen.getByLabelText(/Password/), 'nope');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
    expect(screen.getByLabelText(/Password/)).toHaveValue('');
    expect(args.onSignedIn).not.toHaveBeenCalled();
  },
};

/** Before any account exists, the screen shows how to create one. */
export const NoUsers: Story = {
  args: { noUsers: true },
  play: async () => {
    expect(await screen.findByText(/node cli.mjs user add/)).toBeInTheDocument();
  },
};
