import XCTest
@testable import ChihayaPet
final class InputTests: XCTestCase {
    func testCandidateConfirmationNeverSendsOrCloses() {
        XCTAssertEqual(InputKeyPolicy.action(keyCode: 36, shift: false, marked: true), .system)
        XCTAssertEqual(InputKeyPolicy.action(keyCode: 53, shift: false, marked: true), .system)
    }
    func testEnterSendsShiftEnterStaysWithTextSystem() {
        XCTAssertEqual(InputKeyPolicy.action(keyCode: 36, shift: false, marked: false), .send)
        XCTAssertEqual(InputKeyPolicy.action(keyCode: 76, shift: false, marked: false), .send)
        XCTAssertEqual(InputKeyPolicy.action(keyCode: 36, shift: true, marked: false), .system)
        XCTAssertEqual(InputKeyPolicy.action(keyCode: 53, shift: false, marked: false), .close)
    }
}
