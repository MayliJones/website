// MindMeter part sections: the data behind each <section class="part-section" data-part="..."> on
// projects/interactive-electromechanical-game.html. Rendered by js/part-section.js.
//
// To add a part: copy the tower entry, give it a new key, and add
// <section class="editorial-section part-section" data-part="yourKey"></section> to the page.
// Image paths are relative to the page. A row uses either media (images shown as they are; zoom: true
// opens one full size when clicked) or carousel (slides with captions, always click-to-enlarge; use it for
// schematics and code).
window.PART_SECTIONS = window.PART_SECTIONS || {};

window.PART_SECTIONS.tower = {
  title: "Insanity Tower",
  intro:
    "The tower measures sanity. In idle mode it glows blue, with a flickering letter 'A' that can be stopped using a capacitive touch sensor behind it. Pressing the button runs a 'sanity check': a microphone reads peak volume through an op-amp circuit with 11× gain, and a rising bar of 16 LEDs shows the result. Past a threshold, the tower goes 'haywire' and triggers the rest of the machine.",
  groups: [
    {
      rows: [
        {
          media: [
            {
              src: "../assets/projects/mind/tower1-crop.webp",
              alt: "The tower's internal LED frame during assembly, with red, blue and yellow LED wires routed through a central tunnel, beside a CAD model of one LED frame section and its wiring channel",
              width: 726,
              height: 619,
            },
          ],
          blocks: [
            {
              heading: "Wiring and LED Layout",
              paragraphs: [
                "The tower uses 16 LEDs, which means 32 LED wires and 38 wires in total. Internal tunnels and LED frames were added to keep the routing neat. Each LED was soldered to short leads and connected to the PCB with jumper wires, so sections can be unplugged and removed for repair.",
              ],
            },
          ],
        },
        {
          media: [
            {
              src: "../assets/projects/mind/tower2-crop.webp",
              alt: "Exploded CAD view of the button: the green PUSH cap, the clip beneath it and the push button, beside a see-through view of the button holder at the top of the tower with its internal wire channels",
              width: 912,
              height: 441,
            },
          ],
          blocks: [
            {
              heading: "Button",
              paragraphs: [
                "A push button at the top of the tower activates the microphone. Its holder has internal channels so the wires run through the tower out of sight. The cap is made from two 3D-printed parts: a small clip that attaches to the button, and a larger 'PUSH' cap glued onto the clip. This avoids gluing directly onto the electronic button, so it can be replaced if it fails.",
              ],
            },
          ],
        },
      ],
    },
    {
      heading: "Electronics and Code",
      rows: [
        {
          // Carousel slides: always click-to-enlarge, shown whole on white
          carousel: [
            {
              src: "../assets/projects/mind/towerc1.webp",
              alt: "Circuit diagram of two daisy-chained 74HC595 shift registers, each driving eight LEDs through 220 ohm resistors, with a 100 nF decoupling capacitor",
              caption: "LED circuit",
              width: 966,
              height: 902,
            },
            {
              src: "../assets/projects/mind/towercode1.webp",
              alt: "Arduino code, lines 127 to 130: latch pin low, shiftOut 0xff, shiftOut 0x00, latch pin high",
              caption: "Shift register code",
              width: 1832,
              height: 312,
            },
            {
              src: "../assets/projects/mind/towerc2.png",
              alt: "Circuit diagram of the microphone amplifier: the microphone feeds a 10 µF coupling capacitor into an LM358 op-amp biased by two 100 kΩ resistors, with 100 kΩ and 10 kΩ feedback resistors setting the gain and 10 µF decoupling and gain-control capacitors",
              caption: "Microphone amplifier circuit",
              width: 1068,
              height: 872,
            },
            {
              src: "../assets/projects/mind/towercode2.webp",
              alt: "Arduino code, lines 146 to 156: the LevelFromPeak function, returning level 0 below a reading of 500, then levels 1 to 7 in steps up to 670, and level 8 above that",
              caption: "Peak level code",
              width: 1118,
              height: 812,
            },
          ],
          blocks: [
            {
              heading: "LED Circuit",
              paragraphs: [
                "Two 74HC595 shift registers control all 16 LEDs using only 3 microcontroller pins. The code sends each register a byte of binary data, written as a hexadecimal value. For example, 0xff turns all eight of a register's outputs on, and 0x00 turns them all off.",
              ],
            },
            {
              heading: "Op-Amp Circuit",
              paragraphs: [
                "The microphone signal is amplified by an LM358 op-amp with a gain of 11×. The Arduino reads the output as a value from 0 to 1023, corresponding to 0 to 5 V. While active, the code works as a software peak detector: it records the highest reading, converts it into a level, and uses a smoothing function to drive the LEDs. The peak then decays gradually, so the lights fall smoothly instead of switching off instantly.",
              ],
            },
            {
              heading: "Capacitors",
              wide: true, // under the carousel, full width
              list: [
                "<strong>AC coupling:</strong> removes any DC offset from the microphone signal before a standard 2.5 V bias is applied.",
                "<strong>Decoupling:</strong> smooths noise from the Arduino power rail to stabilise the signal.",
                "<strong>Gain control:</strong> blocks DC gain in the amplifier stage, so only the AC audio signal is amplified.",
              ],
            },
          ],
        },
      ],
    },
  ],
};

window.PART_SECTIONS.diamonds = {
  title: "Magic Diamonds",
  intro:
    "Six diamond-topped pistons that follow the user's hand, turning a simple distance sensor into a reactive, skill-based game.",
  introBlocks: [
    {
      heading: "Idle Mode",
      paragraphs: [
        "A time-of-flight sensor measures how far away the user's hand is, and the pistons move to match it, so the motion feels intuitive and responsive.",
      ],
    },
    {
      heading: "Perception Test",
      paragraphs: [
        "The user holds their hand above the start sticker. After one second, a red, yellow, green countdown appears on the Insanity Tower. When the lights go off, the user must move their hand smoothly to the end of the pistons, aiming to take exactly 3 seconds. The tower then grades their timing with a red, yellow or green result. Moving early triggers a 'false start' flash pattern.",
      ],
    },
  ],
  groups: [
    {
      rows: [
        {
          media: [
            {
              src: "../assets/projects/mind/diamond1-web.webp",
              alt: "Annotated CAD render of the piston mechanism: the main 3D-printed gear shaft with chamfered, thickened connections meshing with six gears, the rising pistons in their support frame, and the servo motor joined to the shaft by an attachment part",
              width: 900,
              height: 997,
              size: "large", // labelled diagram: fill the column instead of the compact 300px cap
              zoom: true,
            },
          ],
          blocks: [
            {
              heading: "Scotch-Yoke Mechanism",
              paragraphs: [
                "A single servo drives a 3D-printed main gear shaft, which meshes 1:1 with six identical gears. Each gear acts as a Scotch-yoke driver: a pin on the gear runs in a slot in the piston carrier, converting the gear's rotation into smooth vertical motion. Because all six gears share one shaft, the pistons stay synchronised and are easy to control in code.",
                "The gears are offset around the shaft so no two pistons peak at the same time, creating a travelling wave along the row. Using one servo instead of six also reduces wiring, control complexity and material use.",
              ],
            },
          ],
        },
        {
          media: [
            {
              src: "../assets/projects/mind/diamond2.webp",
              alt: "The printed piston parts laid out before assembly: the white cover and base plate, the green gear shaft, six green diamond tops, and six numbered gear and Scotch-yoke modules with blue piston rods",
              width: 1434,
              height: 1208,
              zoom: true,
            },
          ],
          blocks: [
            {
              heading: "Assembly",
              paragraphs: [
                "The gear shaft is printed as a single part, so the gears are automatically aligned at the correct phase angles, with chamfered connections for strength. The crank pins sit 20 mm from each gear's centre, giving a 40 mm piston stroke. Each gear is engraved with a number so it's quick to identify its position and hard to assemble in the wrong order.",
              ],
            },
          ],
        },
        {
          carousel: [
            {
              src: "../assets/projects/mind/diamond3.webp",
              alt: "CAD model of the original barrel cam concept: a horizontal shaft driving three bevel gear pairs, each turning a barrel cam under a vertical piston tube",
              caption: "Original barrel cam concept",
              width: 900,
              height: 540,
            },
            {
              src: "../assets/projects/mind/diamond4.webp",
              alt: "CAD model of an early Scotch-yoke design: six gears on a thin shaft driving six pistons in a frame, with a small drive gear at one end",
              caption: "Early Scotch-yoke design",
              width: 816,
              height: 508,
            },
          ],
          blocks: [
            {
              heading: "Iterations",
              paragraphs: [
                "Our original concept used a barrel cam. We tested it through several iterations, but the 3D-printed cam followers had too much friction to climb the barrel reliably. Rather than keep forcing a design that wasn't working, we pivoted to a Scotch-yoke mechanism. Our first Scotch-yoke prototypes showed the shaft was too weak, so we kept refining it, thickening the shaft and adding chamfered connections, until it was strong enough for the final build.",
              ],
            },
          ],
        },
        {
          ratio: "16 / 10", // wide circuit and code images: a shorter frame, level with the text
          carousel: [
            {
              src: "../assets/projects/mind/diamond5.png",
              alt: "Circuit diagram of the VL53L0X time-of-flight sensor, connected by SDA and SCL with 5 V power, and the servo motor with its signal pin, 5 V and ground",
              caption: "Sensor and servo circuit",
              width: 1134,
              height: 638,
            },
            {
              src: "../assets/projects/mind/diamond6.png",
              alt: "Arduino code, lines 38 to 47: the AngleFromDistance function sets the angle to 0 outside 0 to 250, otherwise constrains the distance to 0 to 180 and maps it to an angle, constrains the angle to 0 to 180 and writes it to the servo",
              caption: "Distance to angle mapping",
              width: 908,
              height: 428,
            },
          ],
          blocks: [
            {
              heading: "Electronics and Code",
              paragraphs: [
                "A VL53L0X time-of-flight sensor continuously measures the distance to the user's hand, and a mapping function converts it into a servo angle in real time. Readings outside the working range return the pistons to rest, and the angle is constrained in software to protect the hardware. millis() gives non-blocking timing, and a state machine built with enums and switch cases lets the pistons behave differently in idle, testing and failure states.",
              ],
            },
          ],
        },
      ],
    },
  ],
};

window.PART_SECTIONS.wheel = {
  title: "Wheel of Luck and Slides of Emotion",
  intro:
    "The Wheel of Luck and Slides of Emotion randomly choose your luck and emotion for the day. The user pulls the side lever to start: while it's held down, the wheel and slides spin continuously and the Insanity Tower LEDs change colour. When the lever is released, the motion carries on for a random amount of time before slowing to a stop, revealing the final luck and emotion combination.",
  groups: [
    {
      rows: [
        {
          carousel: [
            {
              src: "../assets/projects/mind/slides1.webp",
              alt: "CAD cutaway of the housing behind the wheel: the barrel with its hanging emotion slides on the left, bevel gears and the yellow DC motor on the right, and the side lever outside",
              caption: "Inside the wheel and slides housing",
              width: 894,
              height: 596,
            },
            {
              src: "../assets/projects/mind/slides2.webp",
              alt: "Exploded CAD view of the drive: the yellow DC motor, a pair of bevel gears, a 2 mm steel shaft, an 8 mm inner diameter bearing and the barrel for the slides",
              caption: "Exploded drive assembly",
              width: 1418,
              height: 648,
            },
          ],
          blocks: [
            {
              heading: "Mechanisms: Wheel and Slides",
              paragraphs: [
                "A DC motor drives a thin steel shaft that's attached directly to the Wheel of Luck. Halfway along it, a pair of matching bevel gears creates a 1:1 drive to a perpendicular shaft, which spins the barrel. The emotion slides hang loosely around the barrel, so they swing round in a loop as it turns. When the motor stops, a fixed stopper at the front catches the top slide, holding one emotion clearly in view instead of letting it fall back or hang at an angle.",
              ],
            },
          ],
        },
        {
          media: [
            {
              src: "../assets/projects/mind/slides3.webp",
              alt: "Labelled CAD side view of the lever mechanism: the green-balled lever turns a pinion gear that drives a vertical rack, with a limit switch at the top of the rack's travel and a hidden wire channel beside it",
              width: 1238,
              height: 1352,
              size: "large", // labelled diagram: fills its column...
              maxWidth: "400px", // ...up to this width
              zoom: true,
            },
          ],
          blocks: [
            {
              heading: "Mechanisms: Lever",
              paragraphs: [
                "The lever turns a small 3D-printed pinion that drives a vertical rack. When the lever is fully pulled, the rack hits a limit switch at the top of its travel, which starts the spin and LED sequence. The rack is printed at 100% infill and the lever at 10%, so the heavier rack pulls the lever back to rest on its own. Two capped support posts keep the rack in its guides, and a channel in the back panel hides the switch wiring.",
              ],
            },
          ],
        },
        {
          media: [
            {
              src: "../assets/projects/mind/slides4.png",
              alt: "Circuit diagram of the motor driver: a MOSFET switches the DC motor to ground from the 5 V supply, with a flyback diode across the motor",
              width: 836,
              height: 588,
              zoom: true,
            },
          ],
          blocks: [
            {
              heading: "Electronics",
              list: [
                "<strong>MOSFET:</strong> used instead of an H-bridge, since the motor only needs to spin in one direction.",
                "<strong>Flyback diode:</strong> protects the circuit from voltage spikes when the motor switches off.",
                "<strong>Separate power rails:</strong> the motor and sensors run on separate rails. When combined, motor noise made the microphone unstable and stopped the motor switching off correctly.",
                "<strong>TT motor:</strong> chosen for its high torque, as the barrel is heavy.",
                "<strong>Limit switch:</strong> the switch's logic was inverted in hardware, so this was corrected in software.",
              ],
            },
          ],
        },
      ],
    },
  ],
};
