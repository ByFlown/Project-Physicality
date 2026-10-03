import femaleUrl from './assets/human-female.bin?url';
import maleUrl from './assets/human-male.bin?url';
import { parseHumanModel, type HumanModel } from './model';

export const MODEL_URLS: Record<'male' | 'female', string> = { male: maleUrl, female: femaleUrl };

const cache = new Map<string, Promise<HumanModel>>();

/** Fetch and decode the body model for one sex (~1.4 MB, cached by the service worker). */
export function loadHumanModel(sex: 'male' | 'female'): Promise<HumanModel> {
  let p = cache.get(sex);
  if (!p) {
    p = fetch(MODEL_URLS[sex])
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load the body model (${res.status})`);
        return res.arrayBuffer();
      })
      .then(parseHumanModel)
      .catch((err) => {
        cache.delete(sex);
        throw err;
      });
    cache.set(sex, p);
  }
  return p;
}
