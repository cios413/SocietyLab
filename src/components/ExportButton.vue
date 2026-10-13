<template>
  <button class="export-btn no-print" @click="doPrint" title="通过浏览器打印功能另存为 PDF">🖨 导出 PDF</button>
</template>

<script setup>
function doPrint() {
  window.print()
}
</script>

<style scoped>
.export-btn { padding: 6px 12px; font-size: 13px; }
</style>
