import { defineStore } from 'pinia';
import { ref } from 'vue';
import { z } from 'zod';

export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export const useSession = defineStore('session', () => {
  const user = ref<z.infer<typeof userSchema> | null>(null);
  const initialized = ref(false);
  async function load() {
    const response = await fetch('/api/v1/me');
    if (response.status === 401) user.value = null;
    else if (!response.ok) throw new Error('无法读取账户，请稍后重试');
    else user.value = userSchema.parse(await response.json());
    initialized.value = true;
  }
  return { user, initialized, load };
});
