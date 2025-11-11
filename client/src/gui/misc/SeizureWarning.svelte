<svelte:options accessors/>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  function proceed(withFireworks: boolean) {
    dispatch('proceed', { withFireworks });
  }
</script>

<style>
  .warning-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.0);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    font-family: Arial, sans-serif;
    text-align: center;
    padding: 20px;
  }

  .warning-text {
    font-size: 24px;
    margin-bottom: 40px;
    max-width: 600px;
  }

  .buttons {
    display: flex;
    gap: 20px;
  }

  button {
    padding: 15px 30px;
    font-size: 18px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s;
  }

  .proceed-btn {
    background-color: #4CAF50;
    color: white;
  }

  .proceed-btn:hover {
    background-color: #45a049;
  }

  .skip-btn {
    background-color: #f44336;
    color: white;
  }

  .skip-btn:hover {
    background-color: #da190b;
  }
</style>

<div class="warning-container">
  <div class="warning-text">
    <strong>Seizure Warning</strong><br><br>
    This website contains flashing lights, colors, and animations that may potentially trigger seizures for people with photosensitive epilepsy. Viewer discretion is advised.<br><br>
    Please proceed only if you are comfortable with visual effects.
  </div>
  <div class="buttons">
    <button class="proceed-btn" on:click={() => proceed(true)}>Proceed with Fireworks</button>
    <button class="skip-btn" on:click={() => proceed(false)}>Skip Fireworks</button>
  </div>
</div>