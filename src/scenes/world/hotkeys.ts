/** 键盘快捷键：打开 / 关闭各面板（原 update() 里的长串 if）。 */
import Phaser from 'phaser';
import { cycleHeld, photoPan } from './actions';
import { changeZoom } from './camera';
import { fishBlocked } from './fishing';
import { openPlaceBoard } from './place';
import type { WorldScene } from '../WorldScene';

import type { Keys } from '../WorldScene';

/** 有面板盖着时：拍照平移 + 各面板的快捷键关闭（再按一次同一个键） */
export function overlayKeys(sc: WorldScene, k: Keys, dt: number, joy: { x: number; y: number } | undefined) {
        if (sc.photo.isOpen) photoPan(sc, dt, joy);
        if (sc.photo.isOpen && Phaser.Input.Keyboard.JustDown(k.p)) sc.photo.close();
        if (sc.profileUi.isOpen && Phaser.Input.Keyboard.JustDown(k.c)) sc.profileUi.close();
        if (sc.boardUi.isOpen && Phaser.Input.Keyboard.JustDown(k.b)) sc.boardUi.close();
        if (sc.noticeUi.isOpen && Phaser.Input.Keyboard.JustDown(k.n)) sc.noticeUi.close();
        if (sc.socialUi.isOpen && Phaser.Input.Keyboard.JustDown(k.f)) sc.socialUi.close();
        if (sc.backpackUi.isOpen && Phaser.Input.Keyboard.JustDown(k.i)) sc.backpackUi.close();
        if (sc.backpackUi.isOpen && Phaser.Input.Keyboard.JustDown(k.g)) { sc.backpackUi.close(); sc.codexUi.open('fish'); }
        if (sc.codexUi.isOpen && Phaser.Input.Keyboard.JustDown(k.h)) sc.codexUi.close();
        if (sc.achUi.isOpen && Phaser.Input.Keyboard.JustDown(k.j)) sc.achUi.close();
        if (sc.hallUi.isOpen && Phaser.Input.Keyboard.JustDown(k.l)) sc.hallUi.close();
        if (sc.placeUi.isOpen && sc.placeKey && Phaser.Input.Keyboard.JustDown(sc.placeKey)) sc.placeUi.close();
        if (sc.questUi.isOpen && Phaser.Input.Keyboard.JustDown(k.q)) sc.questUi.close();
        if (sc.partyUi.isOpen && Phaser.Input.Keyboard.JustDown(k.t)) sc.partyUi.close();
        if (sc.monUi.isOpen && Phaser.Input.Keyboard.JustDown(k.r)) sc.monUi.close();
        if (sc.tpUi.isOpen && Phaser.Input.Keyboard.JustDown(k.y)) sc.tpUi.close();
        if (sc.worldUi.isOpen && Phaser.Input.Keyboard.JustDown(k.o)) sc.worldUi.close();
        if (sc.dormUi.anyOpen && Phaser.Input.Keyboard.JustDown(k.u)) { sc.dormUi.close(); sc.dormUi.closeChest(); }
        if (sc.adminUi.isOpen && Phaser.Input.Keyboard.JustDown(k.k)) sc.adminUi.close();
}

/** 正常游玩时的界面快捷键（钓鱼中 fl = true：会打断钓鱼的先提示、不响应） */
export function mainHotkeys(sc: WorldScene, k: Keys, fl: boolean) {
        if (Phaser.Input.Keyboard.JustDown(k.x)) { if (fl) fishBlocked(sc); else sc.emoteUi.toggle(); }
        if (Phaser.Input.Keyboard.JustDown(k.p)) { if (fl) fishBlocked(sc); else sc.photo.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.m)) sc.hud.toggleMap();
        if (Phaser.Input.Keyboard.JustDown(k.c)) { if (fl) fishBlocked(sc); else sc.profileUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.b)) { if (fl) fishBlocked(sc); else sc.boardUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.n)) { if (fl) fishBlocked(sc); else sc.noticeUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.f)) { if (fl) fishBlocked(sc); else sc.socialUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.i)) sc.backpackUi.open();
        if (Phaser.Input.Keyboard.JustDown(k.h)) { if (fl) fishBlocked(sc); else sc.codexUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.v)) { if (fl) fishBlocked(sc); else cycleHeld(sc); }
        if (Phaser.Input.Keyboard.JustDown(k.g)) sc.codexUi.open('fish');
        if (Phaser.Input.Keyboard.JustDown(k.j)) { if (fl) fishBlocked(sc); else sc.achUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.l)) { if (fl) fishBlocked(sc); else sc.hallUi.open(); }
        if (sc.placeKey && Phaser.Input.Keyboard.JustDown(sc.placeKey)) { if (fl) fishBlocked(sc); else openPlaceBoard(sc); }
        if (Phaser.Input.Keyboard.JustDown(k.q)) { if (fl) fishBlocked(sc); else sc.questUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.t)) { if (fl) fishBlocked(sc); else sc.partyUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.r)) { if (fl) fishBlocked(sc); else sc.monUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.y)) { if (fl) fishBlocked(sc); else sc.tpUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.u)) { if (fl) fishBlocked(sc); else sc.dormUi.goHome(); }
        if (Phaser.Input.Keyboard.JustDown(k.o)) { if (fl) fishBlocked(sc); else sc.worldUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.k) && sc.net.isAdmin) { if (fl) fishBlocked(sc); else sc.adminUi.open(); }
        if (Phaser.Input.Keyboard.JustDown(k.enter)) sc.chatUi.focus();
        if (Phaser.Input.Keyboard.JustDown(k.plus) || Phaser.Input.Keyboard.JustDown(k.plus2)) changeZoom(sc, 1);
        if (Phaser.Input.Keyboard.JustDown(k.minus) || Phaser.Input.Keyboard.JustDown(k.minus2)) changeZoom(sc, -1);
}
