import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = {
    title: 'Nuradi Render Studio', description: 'Create, render and deliver from your Mac.'
};
export default function Layout({ children }: {
    children: React.ReactNode;
}) {
    return <html lang="en"><body>{children}</body></html>;
}
