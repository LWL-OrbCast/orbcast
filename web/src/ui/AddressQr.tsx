import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function AddressQr({ value, size = 140 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then((markup) => {
      if (!cancelled) setSvg(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className="overflow-hidden rounded-lg bg-white [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : null}
    </div>
  );
}
