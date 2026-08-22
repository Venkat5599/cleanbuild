import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import appCss from '../styles/app.css?url';

const NAV = [
  { to: '/', label: 'Posterior' },
  { to: '/ledger', label: 'Ledger' },
  { to: '/learned', label: 'Learned' },
  { to: '/gate', label: 'Canon gate' },
  { to: '/notifications', label: 'Follow-ups' },
  { to: '/about', label: 'About' },
] as const;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'RATCHET' },
      {
        name: 'description',
        content:
          'A persistent agent that treats every post as an experiment and learns what works for one specific audience.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="page">
          {/* One line, contained. Weight carries the active state; there is no
              dot marker underneath and no underline that grows on hover. */}
          <nav className="nav">
            <Link to="/" className="nav__mark">
              RATCHET
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="nav__link"
                activeProps={{ 'data-active': 'true' }}
                activeOptions={{ exact: item.to === '/' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Outlet />
        </div>
        <Scripts />
      </body>
    </html>
  );
}
