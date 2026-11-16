<script setup lang="ts">
import type { Task } from "@stt/shared";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { isOnline } from "../connection.ts";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ close: []; deleted: [id: string] }>();

const { t } = useI18n();
const deleting = ref(false);

async function remove(): Promise<void> {
  if (!isOnline.value || deleting.value) return;
  const { id } = props.task;
  deleting.value = true;
  try {
    await api.deleteTask(id);
  } catch (error) {
    if (error instanceof api.NetworkError) return;
    if (!api.isApiError(error, "not_found")) throw error;
  } finally {
    deleting.value = false;
  }
  emit("deleted", id);
}
</script>

<template>
  <AppConfirmDialog
    :title="t('tasks.deleteQuestion')"
    :confirm-label="t('tasks.delete')"
    :busy="deleting"
    :confirm-disabled="!isOnline"
    @close="emit('close')"
    @confirm="remove"
  >
    <span>{{ t("tasks.deleteNote") }}</span>
    <span v-if="task.notionPageUrl !== null">{{ " " + t("tasks.deleteNotionNote") }}</span>
  </AppConfirmDialog>
</template>
