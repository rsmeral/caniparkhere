import { useState } from "preact/hooks";
import { install, useCanInstall } from "../install";
import { Sheet } from "./Sheet";

const SOURCE_URL = "https://github.com/rsmeral/caniparkhere";

/** GitHub's mark, from Primer Octicons (MIT). */
const GitHubIcon = () => (
  <svg className="app__sheet-action-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"
    />
  </svg>
);

/** A parcel box, for installing. */
const PackageIcon = () => (
  <svg
    className="app__sheet-action-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2.5 3 7v10l9 4.5 9-4.5V7l-9-4.5Z" />
    <path d="M3 7l9 4.5L21 7M12 11.5v10M7.5 4.75l9 4.5" />
  </svg>
);

/** The app's icon in the top right corner, opening the About page. */
export function AboutButton() {
  const [open, setOpen] = useState(false);
  const installable = useCanInstall();

  return (
    <>
      <button
        type="button"
        className="app__about-button"
        aria-label="About"
        onClick={() => setOpen(true)}
      >
        <img className="app__about-icon" src="/icons/icon.png" alt="" />
      </button>
      <Sheet
        title="Can I park here?"
        open={open}
        onClose={() => setOpen(false)}
        actions={
          <>
            {installable && (
              <button type="button" className="app__sheet-action" onClick={() => void install()}>
                <PackageIcon />
                Install
              </button>
            )}
            <a className="app__sheet-action" href={SOURCE_URL} target="_blank" rel="noopener">
              <GitHubIcon />
              Source
            </a>
          </>
        }
      >
        <p>
          So you want to park in Prague? Bad idea!
          <br />
          But if you must, use this app.
          <br />
          It tells you if you can, and how much it'll cost you.
        </p>
        <p>
          Worried about privacy? Yeah, me too.
          <br />
          This app preserves it as much as possible:
        </p>
        <ul>
          <li>After the first load, it only downloads zone updates. It never sends anything.</li>
          <li>Your location stays on your phone.</li>
          <li>In fact, use it offline!</li>
        </ul>
        <p className="app__sheet-note">
          Disclaimer: the signs on the street always win. If I'm wrong, the fine is still yours.
        </p>
      </Sheet>
    </>
  );
}
