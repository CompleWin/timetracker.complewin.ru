<script setup lang="ts">
import { projectColors, type ProjectColor } from "@stt/shared";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import AppChip from "./ui/AppChip.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const color = defineModel<ProjectColor>({ required: true });
const { t } = useI18n();
const groupName = useId();
</script>

<template>
  <fieldset>
    <AppSectionLabel as="legend" class="mb-2">{{ t("projects.color") }}</AppSectionLabel>
    <div class="flex flex-wrap gap-2">
      <AppChip
        v-for="option in projectColors"
        :key="option"
        as="label"
        size="sm"
        :active="color === option"
      >
        <input v-model="color" type="radio" class="sr-only" :name="groupName" :value="option" />
        <ProjectMarker :color="option" :ringed="color === option" />
        {{ t(`colors.${option}`) }}
      </AppChip>
    </div>
  </fieldset>
</template>
