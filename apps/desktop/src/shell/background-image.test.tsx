import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Background } from './background';

const URL_OK = 'http://asset.localhost/C%3A%5Cdata%5Cwallpapers%5Cwallpaper-5.png';

describe('Background with an uploaded image', () => {
  it('covers the window with the image in Wallpaper mode', () => {
    render(<Background mode="wallpaper" imageUrl={URL_OK} />);
    const layer = screen.getByTestId('background');
    expect(layer).toHaveAttribute('data-image', 'true');
    expect(layer.style.backgroundImage).toBe(`url("${URL_OK}")`);
    expect(layer.style.backgroundSize).toBe('cover');
    expect(layer.style.backgroundPosition).toBe('center center');
    expect(layer.style.backgroundRepeat).toBe('no-repeat');
  });

  it('uses the built-in gradient when there is no image', () => {
    render(<Background mode="wallpaper" imageUrl={null} />);
    expect(screen.getByTestId('background')).toHaveStyle({
      background: 'var(--wallpaper-default)',
    });
    expect(screen.getByTestId('background')).toHaveAttribute('data-image', 'false');
  });

  it('ignores the image in Transparent and Solid modes', () => {
    const { rerender } = render(<Background mode="transparent" imageUrl={URL_OK} />);
    expect(screen.getByTestId('background')).toHaveStyle({ background: 'var(--tint)' });
    expect(screen.getByTestId('background').style.backgroundImage).toBe('');

    rerender(<Background mode="solid" imageUrl={URL_OK} />);
    expect(screen.getByTestId('background').style.backgroundImage).toBe('');
    expect(screen.getByTestId('background')).toHaveAttribute('data-image', 'false');
  });

  it('cannot be broken out of the url() by a quote in the address', () => {
    render(<Background mode="wallpaper" imageUrl={'http://x/a".png'} />);
    expect(screen.getByTestId('background').style.backgroundImage).toBe('url("http://x/a%22.png")');
  });
});
