<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";
import AppButton from "./ui/AppButton.vue";
import AppField from "./ui/AppField.vue";
import AppModal from "./ui/AppModal.vue";

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const confirmation = ref("");
const deleting = ref(false);

const confirmed = computed(
  () => confirmation.value.trim().toLocaleLowerCase(currentLocale()) === t("account.confirmWord"),
);

function close(): void {
  if (!deleting.value) emit("close");
}

async function deleteForever(): Promise<void> {
  deleting.value = true;
  try {
    await session.deleteAccount();
    await router.push("/login");
  } catch {
    deleting.value = false;
  }
}
</script>

<template>
  <AppModal :title="t('account.dialogTitle')" @close="close">
    <p class="text-body text-fg-muted">{{ t("account.warning") }}</p>
    <AppField v-model="confirmation" :label="t('account.confirmLabel')" class="mt-5" />
    <template #actions>
      <AppButton variant="outline-gray" width="full-on-mobile" :disabled="deleting" @click="close">
        {{ t("dialog.cancel") }}
      </AppButton>
      <AppButton
        variant="solid-danger"
        width="full-on-mobile"
        :disabled="!confirmed || deleting"
        @click="deleteForever"
      >
        {{ t("account.deleteForever") }}
      </AppButton>
    </template>
  </AppModal>
</template>
