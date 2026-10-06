$(document).ready(function () {
  $(".menu-toggle").on("click", function () {
    $(".nav").toggleClass("showing");
    $(this).attr("aria-expanded", $(".nav").hasClass("showing") ? "true" : "false");
  });

  if ($(".post-wrapper").length && $.fn.slick) {
    $(".post-wrapper").slick({
      slidesToShow: 3,
      slidesToScroll: 1,
      autoplay: true,
      autoplaySpeed: 2000,
      nextArrow: $(".next"),
      prevArrow: $(".prev"),
      responsive: [
        {
          breakpoint: 1000,
          settings: {
            slidesToShow: 2,
            slidesToScroll: 1,
          },
        },
        {
          breakpoint: 600,
          settings: {
            slidesToShow: 1,
            slidesToScroll: 1,
          },
        },
      ],
    });
  }
});

var bodyField = document.querySelector("#body");
if (bodyField && window.ClassicEditor) {
  ClassicEditor.create(bodyField, {
    toolbar: {
      items: [
        "heading",
        "|",
        "bold",
        "italic",
        "link",
        "bulletedList",
        "numberedList",
        "blockQuote",
        "|",
        "insertTable",
        "|",
        "undo",
        "redo",
      ],
    },
    table: {
      contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"],
    },
  }).catch(function (error) {
    console.error(error);
  });
}
