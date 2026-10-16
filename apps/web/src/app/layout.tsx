import type { Metadata } from 'next';
// Fonts are self-hosted (no build-time or runtime call to Google): the production build works
// offline, no visitor IP goes to a third party, and the CSP needs no font origins. Variable fonts
// carry unicode-range subsets, so a Telugu visitor only downloads the Telugu file.
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource-variable/noto-sans-telugu';
import '@fontsource-variable/noto-sans-tamil';
import './globals.css';
import ClientLayoutWrapper from '../components/ClientLayoutWrapper';


export const metadata: Metadata = {
  title: 'Parivar Path',
  description: 'Vocational counselling platform',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-background text-textDark min-h-screen">
        <ClientLayoutWrapper>
          {children}
        </ClientLayoutWrapper>
      </body>
    </html>
  );
}
